const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const app = express();

// Store active extraction processes
const activeExtractions = new Map();

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/data', express.static('data'));

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve the main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to start extraction
app.post('/api/extract/start', async (req, res) => {
    const { url, duration, useAdsPower } = req.body;

    // Validate input
    if (!url || !url.includes('newsbreak.com')) {
        return res.status(400).json({
            error: 'Invalid URL. Please provide a valid NewsBreak URL.'
        });
    }

    const extractionId = Date.now().toString();
    const durationMinutes = parseInt(duration) || 5;

    try {
        // Determine which extractor to use
        const scriptPath = useAdsPower ? 'adsPowerExtractor.js' : 'extractAds.js';

        console.log(`Starting extraction with script: ${scriptPath}`);
        console.log(`URL: ${url}, Duration: ${durationMinutes} minutes`);

        // Start extraction process
        const extractorProcess = spawn('node', [
            scriptPath,
            url,
            durationMinutes.toString()
        ], {
            cwd: __dirname,
            shell: true,  // Changed to true for Windows compatibility
            windowsHide: false,
            env: { ...process.env },  // Pass environment variables
            stdio: ['ignore', 'pipe', 'pipe']  // Proper stdio handling
        });

        // Store process reference
        activeExtractions.set(extractionId, {
            process: extractorProcess,
            startTime: new Date(),
            url,
            duration: durationMinutes,
            status: 'running',
            logs: []
        });

        // Capture output
        extractorProcess.stdout.on('data', (data) => {
            const extraction = activeExtractions.get(extractionId);
            const output = data.toString();
            console.log('Extraction output:', output);
            if (extraction) {
                extraction.logs.push(output);
            }
        });

        extractorProcess.stderr.on('data', (data) => {
            const extraction = activeExtractions.get(extractionId);
            const errorMsg = data.toString();
            console.error('Extraction stderr:', errorMsg);
            if (extraction) {
                extraction.logs.push(`ERROR: ${errorMsg}`);
            }
        });

        extractorProcess.on('error', (error) => {
            console.error('Failed to start extraction process:', error);
            const extraction = activeExtractions.get(extractionId);
            if (extraction) {
                extraction.status = 'failed';
                extraction.logs.push(`SPAWN ERROR: ${error.message}`);
            }
        });

        extractorProcess.on('close', (code) => {
            console.log(`Extraction process exited with code ${code}`);
            const extraction = activeExtractions.get(extractionId);
            if (extraction) {
                extraction.status = code === 0 ? 'completed' : 'failed';
                extraction.endTime = new Date();
            }
        });

        res.json({
            extractionId,
            message: 'Extraction started successfully',
            duration: durationMinutes,
            url
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to start extraction',
            details: error.message
        });
    }
});

// API endpoint to stop extraction
app.post('/api/extract/stop/:id', (req, res) => {
    const { id } = req.params;
    const extraction = activeExtractions.get(id);

    if (!extraction) {
        return res.status(404).json({ error: 'Extraction not found' });
    }

    if (extraction.process && extraction.status === 'running') {
        extraction.process.kill();
        extraction.status = 'stopped';
        extraction.endTime = new Date();
        res.json({ message: 'Extraction stopped successfully' });
    } else {
        res.status(400).json({ error: 'Extraction is not running' });
    }
});

// API endpoint to get extraction status
app.get('/api/extract/status/:id', (req, res) => {
    const { id } = req.params;
    const extraction = activeExtractions.get(id);

    if (!extraction) {
        return res.status(404).json({ error: 'Extraction not found' });
    }

    res.json({
        id,
        status: extraction.status,
        startTime: extraction.startTime,
        endTime: extraction.endTime,
        url: extraction.url,
        duration: extraction.duration,
        logs: extraction.logs.slice(-50) // Last 50 log entries
    });
});

// API endpoint to get ads from current or specific session
app.get('/api/ads', async (req, res) => {
    try {
        const { session, refresh } = req.query;

        if (session) {
            // Load specific session
            const sessionFile = path.join(__dirname, 'data', 'sessions', session);
            if (await fs.exists(sessionFile)) {
                const sessionData = await fs.readJson(sessionFile);
                res.json(sessionData.ads || []);
            } else {
                res.status(404).json({ error: 'Session not found' });
            }
        } else {
            // Load current session
            const currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
            if (await fs.exists(currentSessionFile)) {
                const currentSession = await fs.readJson(currentSessionFile);
                const sessionFile = path.join(__dirname, 'data', 'sessions', currentSession.sessionFile);
                if (await fs.exists(sessionFile)) {
                    const sessionData = await fs.readJson(sessionFile);

                    // If refresh is requested, only return ads from last 5 minutes
                    if (refresh === 'true') {
                        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                        const freshAds = (sessionData.ads || []).filter(ad => {
                            const adTime = new Date(ad.timestamp).getTime();
                            return adTime > fiveMinutesAgo;
                        });
                        res.json(freshAds);
                    } else {
                        res.json(sessionData.ads || []);
                    }
                } else {
                    res.json([]);
                }
            } else {
                res.json([]);
            }
        }
    } catch (error) {
        console.error('Failed to load ads:', error);
        res.status(500).json({ error: 'Failed to load ads' });
    }
});

// API endpoint to get all sessions
app.get('/api/sessions/list', async (req, res) => {
    try {
        const indexFile = path.join(__dirname, 'data', 'sessions', 'index.json');
        if (await fs.exists(indexFile)) {
            const sessions = await fs.readJson(indexFile);
            // Sort by timestamp, newest first
            sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            res.json(sessions);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

// API endpoint to get current session info
app.get('/api/sessions/current', async (req, res) => {
    try {
        const currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
        if (await fs.exists(currentSessionFile)) {
            const currentSession = await fs.readJson(currentSessionFile);
            res.json(currentSession);
        } else {
            res.json(null);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load current session' });
    }
});

// API endpoint to get sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const sessionsFile = path.join(__dirname, 'data', 'sessions', 'index.json');
        if (await fs.exists(sessionsFile)) {
            const sessions = await fs.readJson(sessionsFile);
            res.json(sessions);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

// API endpoint to get specific session
app.get('/api/sessions/:filename', async (req, res) => {
    try {
        const sessionFile = path.join(__dirname, 'data', 'sessions', req.params.filename);
        if (await fs.exists(sessionFile)) {
            const session = await fs.readJson(sessionFile);
            res.json(session);
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load session' });
    }
});

// API endpoint to export data
app.get('/api/export/:format', async (req, res) => {
    const { format } = req.params;

    try {
        const adsFile = path.join(__dirname, 'data', 'extracted_ads.json');
        const ads = await fs.readJson(adsFile);

        if (format === 'json') {
            res.setHeader('Content-Disposition', 'attachment; filename=ads.json');
            res.json(ads);
        } else if (format === 'csv') {
            // Convert to CSV
            const csv = convertToCSV(ads);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=ads.csv');
            res.send(csv);
        } else {
            res.status(400).json({ error: 'Invalid export format' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Helper function to convert to CSV
function convertToCSV(ads) {
    if (!ads || ads.length === 0) return '';

    const headers = ['ID', 'Timestamp', 'Advertiser', 'Headline', 'Body', 'Link', 'Image', 'Container ID', 'Size'];
    const rows = ads.map(ad => [
        ad.id || '',
        ad.timestamp || '',
        ad.advertiser || '',
        ad.headline || '',
        ad.body || '',
        ad.link || '',
        ad.image || '',
        ad.containerId || '',
        ad.iframeSize || ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
}

// API endpoint to create a new session
app.post('/api/sessions/new', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionFile = `session_${timestamp}.json`;
        const sessionPath = path.join(__dirname, 'data', 'sessions', sessionFile);

        // Create new empty session
        const sessionData = {
            timestamp: new Date().toISOString(),
            ads: [],
            totalAds: 0,
            advertisers: [],
            sessionId: timestamp
        };

        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));
        await fs.writeJson(sessionPath, sessionData);

        // Update current session pointer
        const currentSessionData = {
            sessionFile,
            timestamp: sessionData.timestamp,
            sessionId: timestamp
        };
        await fs.writeJson(path.join(__dirname, 'data', 'current_session.json'), currentSessionData);

        // Update sessions index
        const indexFile = path.join(__dirname, 'data', 'sessions', 'index.json');
        let sessions = [];
        if (await fs.exists(indexFile)) {
            sessions = await fs.readJson(indexFile);
        }

        sessions.unshift({
            file: sessionFile,
            timestamp: sessionData.timestamp,
            totalAds: 0,
            sessionId: timestamp
        });

        // Keep only last 20 sessions
        sessions = sessions.slice(0, 20);
        await fs.writeJson(indexFile, sessions);

        res.json({
            success: true,
            sessionFile,
            sessionId: timestamp,
            message: 'New session created successfully'
        });
    } catch (error) {
        console.error('Failed to create new session:', error);
        res.status(500).json({ error: 'Failed to create new session' });
    }
});

// API endpoint to switch to a different session
app.post('/api/sessions/switch', async (req, res) => {
    try {
        const { sessionFile } = req.body;

        if (!sessionFile) {
            return res.status(400).json({ error: 'Session file required' });
        }

        const sessionPath = path.join(__dirname, 'data', 'sessions', sessionFile);
        if (!(await fs.exists(sessionPath))) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Update current session pointer
        const sessionData = await fs.readJson(sessionPath);
        const currentSessionData = {
            sessionFile,
            timestamp: sessionData.timestamp,
            sessionId: sessionData.sessionId
        };
        await fs.writeJson(path.join(__dirname, 'data', 'current_session.json'), currentSessionData);

        res.json({
            success: true,
            sessionFile,
            message: 'Switched to session successfully'
        });
    } catch (error) {
        console.error('Failed to switch session:', error);
        res.status(500).json({ error: 'Failed to switch session' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeExtractions: activeExtractions.size
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 NewsBreak Ads Crawler Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
});

module.exports = app;