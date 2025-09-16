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
        const scriptPath = useAdsPower ? 'adsPowerCurrent.js' : 'extractAds.js';

        // Start extraction process
        const extractorProcess = spawn('node', [
            scriptPath,
            url,
            durationMinutes.toString()
        ]);

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
            if (extraction) {
                extraction.logs.push(data.toString());
            }
        });

        extractorProcess.stderr.on('data', (data) => {
            const extraction = activeExtractions.get(extractionId);
            if (extraction) {
                extraction.logs.push(`ERROR: ${data.toString()}`);
            }
        });

        extractorProcess.on('close', (code) => {
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

// API endpoint to get all ads
app.get('/api/ads', async (req, res) => {
    try {
        const adsFile = path.join(__dirname, 'data', 'extracted_ads.json');
        if (await fs.exists(adsFile)) {
            const ads = await fs.readJson(adsFile);
            res.json(ads);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load ads' });
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