const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const queryRoutes = require('./src/api/queryRoutes');
const BackgroundExtractionService = require('./src/services/backgroundExtractor');
const MultiThreadExtractor = require('./src/services/multiThreadExtractor');
const { authenticateUser, generateToken, requireAuth, requireAdmin } = require('./src/auth/authMiddleware');
const userManager = require('./src/auth/userManager');
const app = express();

// Store active extraction processes
const activeExtractions = new Map();

// Initialize background extraction service with update callback
const backgroundExtractor = new BackgroundExtractionService();

// Initialize multi-thread extractor (optional, started via API)
let multiThreadExtractor = null;

// Set up callback to broadcast updates to SSE clients
backgroundExtractor.onUpdate = (data) => {
    // Broadcast to all connected SSE clients
    if (typeof broadcastUpdate === 'function') {
        broadcastUpdate(data);
    }
};

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: null // Session cookie - expires when browser closes
    }
}));

// Static files - only serve public assets, not protected pages
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/data', express.static('data'));

// Database query API routes
app.use('/api/query', queryRoutes);

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Authentication routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await authenticateUser(username, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = generateToken(user);

        // Set token as httpOnly cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
            // No maxAge = session cookie (expires when browser closes)
        });

        res.json({
            success: true,
            token,
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        user: {
            username: req.user.username,
            role: req.user.role
        }
    });
});

// Root route - redirect based on authentication
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Admin dashboard - requires admin role
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Viewer dashboard - requires authentication
app.get('/viewer', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// User management page - Admin only
app.get('/users', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user-management.html'));
});

// User management API endpoints
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await userManager.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;

    try {
        const newUser = await userManager.createUser(username, password, role);
        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/users/:username/role', requireAuth, requireAdmin, async (req, res) => {
    const { username } = req.params;
    const { role } = req.body;

    try {
        await userManager.updateUserRole(username, role);
        res.json({ success: true, message: 'Role updated successfully' });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/users/:username/password', requireAuth, requireAdmin, async (req, res) => {
    const { username } = req.params;
    const { password } = req.body;

    try {
        await userManager.updateUserPassword(username, password);
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/:username', requireAuth, requireAdmin, async (req, res) => {
    const { username } = req.params;

    try {
        await userManager.deleteUser(username);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(400).json({ error: error.message });
    }
});

// API endpoint to start extraction - Admin only (NOW WITH MULTI-THREADING)
app.post('/api/extract/start', requireAuth, requireAdmin, async (req, res) => {
    const {
        url,
        duration,
        deviceMode = 'desktop',
        extractionMode = 'unlimited', // Changed default to unlimited
        useMultiThread = true, // NEW: Enable multi-threading by default
        maxWorkers = 5 // NEW: Default 5 workers
    } = req.body;

    // Validate input
    if (!url || !url.includes('newsbreak.com')) {
        return res.status(400).json({
            error: 'Invalid URL. Please provide a valid NewsBreak URL.'
        });
    }

    const extractionId = Date.now().toString();
    const durationMinutes = extractionMode === 'unlimited' ? null : (parseInt(duration) || 5);

    try {
        // Use multi-threading for unlimited mode (better performance)
        if (useMultiThread && extractionMode === 'unlimited') {
            // Check if multi-thread extractor is already running
            if (multiThreadExtractor && multiThreadExtractor.getStatus().isRunning) {
                return res.status(400).json({
                    error: 'Multi-thread extraction already running. Stop it first or use single-thread mode.'
                });
            }

            console.log(`🚀 Starting MULTI-THREAD extraction with ${maxWorkers} workers`);
            console.log(`URL: ${url}, Mode: unlimited, Device: ${deviceMode}`);

            multiThreadExtractor = new MultiThreadExtractor({
                maxWorkers: parseInt(maxWorkers) || 5,
                deviceMode,
                restartOnFailure: true,
                sameUrl: false, // Different URLs for better ad diversity
                baseUrl: url
            });

            await multiThreadExtractor.start();

            res.json({
                extractionId,
                message: `Multi-thread extraction started with ${maxWorkers} workers`,
                mode: 'multi-thread',
                workers: maxWorkers,
                extractionMode: 'unlimited',
                url,
                deviceMode
            });

        } else {
            // Single-thread extraction (original behavior)
            console.log(`Starting ${extractionMode} extraction (single-thread)...`);
            console.log(`URL: ${url}, Duration: ${durationMinutes ? durationMinutes + ' minutes' : 'unlimited'}, Device: ${deviceMode}`);

            const result = await backgroundExtractor.startExtraction({
                url,
                duration: durationMinutes,
                deviceMode,
                extractionMode,
                sessionId: extractionId
            });

            // Store extraction reference
            activeExtractions.set(extractionId, {
                backgroundExtraction: true,
                startTime: new Date(),
                url,
                duration: durationMinutes,
                deviceMode,
                extractionMode,
                status: 'running',
                logs: []
            });

            res.json({
                extractionId,
                message: `${extractionMode} extraction started successfully (single-thread)`,
                mode: 'single-thread',
                duration: durationMinutes ? `${durationMinutes} minutes` : 'unlimited',
                url,
                extractionMode,
                deviceMode
            });
        }

    } catch (error) {
        res.status(500).json({
            error: 'Failed to start extraction',
            details: error.message
        });
    }
});

// API endpoint to resume extraction - Admin only
app.post('/api/extract/resume/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await backgroundExtractor.resumeExtraction(id);

        // Update active extractions map
        activeExtractions.set(id, {
            backgroundExtraction: true,
            startTime: new Date(),
            url: result.config.url,
            duration: result.config.duration,
            deviceMode: result.config.deviceMode,
            extractionMode: result.config.extractionMode,
            status: 'running',
            logs: [],
            resumed: true
        });

        res.json({
            message: 'Extraction resumed successfully',
            extractionId: id,
            config: result.config
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to resume extraction',
            details: error.message
        });
    }
});

// API endpoint to stop extraction - Admin only
app.post('/api/extract/stop/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const extraction = activeExtractions.get(id);

        if (!extraction) {
            return res.status(404).json({ error: 'Extraction not found' });
        }

        if (extraction.backgroundExtraction) {
            // Stop background extraction
            await backgroundExtractor.stopExtraction(id);
            extraction.status = 'stopped';
            extraction.endTime = new Date();
        } else if (extraction.process && extraction.status === 'running') {
            // Stop legacy process-based extraction
            extraction.process.kill();
            extraction.status = 'stopped';
            extraction.endTime = new Date();
        }

        res.json({ message: 'Extraction stopped successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to stop extraction', details: error.message });
    }
});

// API endpoint to get extraction status
app.get('/api/extract/status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const extraction = activeExtractions.get(id);

        if (!extraction) {
            return res.status(404).json({ error: 'Extraction not found' });
        }

        let status = extraction;

        // Get detailed status from background extractor if available
        if (extraction.backgroundExtraction) {
            const backgroundStatus = await backgroundExtractor.getExtractionStatus(id);
            if (backgroundStatus) {
                status = {
                    ...extraction,
                    ...backgroundStatus,
                    logs: backgroundStatus.logs || extraction.logs
                };
            }
        }

        res.json({
            id,
            status: status.status,
            startTime: status.startTime,
            endTime: status.endTime,
            url: status.url,
            duration: status.duration,
            extractionMode: status.extractionMode,
            deviceMode: status.deviceMode,
            totalAds: status.totalAds || 0,
            progress: status.progress,
            logs: (status.logs || []).slice(-50) // Last 50 log entries
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get extraction status', details: error.message });
    }
});


// API endpoint to get ads from current or specific session with time filtering
app.get('/api/ads', async (req, res) => {
    try {
        const { session, refresh, timeframe } = req.query;
        let sessionId = null;

        if (session) {
            // Load specific session - extract sessionId from filename
            const sessionFile = path.join(__dirname, 'data', 'sessions', session);
            if (await fs.exists(sessionFile)) {
                const sessionData = await fs.readJson(sessionFile);
                sessionId = sessionData.sessionId;
            } else {
                return res.status(404).json({ error: 'Session not found' });
            }
        } else {
            // Load current session or most recent session
            const currentSessionFile = path.join(__dirname, 'data', 'current_session.json');

            // First try to load from current_session.json
            if (await fs.exists(currentSessionFile)) {
                const currentSession = await fs.readJson(currentSessionFile);
                sessionId = currentSession.sessionId;
            }

            // If current session doesn't exist, find the most recent session
            if (!sessionId) {
                const sessionsDir = path.join(__dirname, 'data', 'sessions');
                const sessionFiles = await fs.readdir(sessionsDir);
                const workerSessions = sessionFiles
                    .filter(f => f.startsWith('worker_') && f.endsWith('.json'))
                    .sort().reverse(); // Get most recent first

                if (workerSessions.length > 0) {
                    const recentFile = path.join(sessionsDir, workerSessions[0]);
                    try {
                        const sessionData = await fs.readJson(recentFile);
                        sessionId = sessionData.sessionId;
                    } catch (e) {
                        // Skip invalid files
                    }
                }
            }
        }

        // Try to load ads from DATABASE first, fallback to JSON if empty
        if (sessionId) {
            let ads = [];
            let loadedFromDb = false;

            // Try database first
            try {
                const DatabaseSyncService = require('./src/database/syncService');
                const dbSync = new DatabaseSyncService();
                await dbSync.initialize();

                // Get all ads for this session from database
                ads = await dbSync.db.getSessionAds(sessionId);
                await dbSync.close();

                if (ads && ads.length > 0) {
                    loadedFromDb = true;
                    console.log(`Loaded ${ads.length} ads from database for session ${sessionId}`);

                    // Convert database column names to match UI expectations
                    ads = ads.map(ad => ({
                        id: ad.ad_id || ad.id,
                        timestamp: ad.timestamp,
                        containerId: ad.container_id || '',
                        adType: ad.ad_type || '',
                        advertiser: ad.ad_network || '',
                        headline: ad.heading || '',
                        body: ad.description || '',
                        image: ad.image_url || '',
                        link: ad.link_url || '',
                        iframeSize: `${ad.width || 0}x${ad.height || 0}`,
                        iframeSrc: ''
                    }));
                }
            } catch (dbError) {
                console.error('Database error:', dbError);
            }

            // Fallback to JSON file if no ads in database
            if (!loadedFromDb || ads.length === 0) {
                console.log(`No ads in database, trying JSON file for session ${sessionId}...`);
                try {
                    // Find the session file
                    const sessionsDir = path.join(__dirname, 'data', 'sessions');
                    const sessionFiles = await fs.readdir(sessionsDir);

                    // Look for matching session file
                    const matchingFile = sessionFiles.find(f =>
                        f.includes(sessionId.replace(/:/g, '-').replace(/\./g, '-'))
                    );

                    if (matchingFile) {
                        const sessionFilePath = path.join(sessionsDir, matchingFile);
                        const sessionData = await fs.readJson(sessionFilePath);
                        ads = sessionData.ads || [];
                        console.log(`Loaded ${ads.length} ads from JSON file ${matchingFile}`);
                    }
                } catch (fileError) {
                    console.error('Failed to load from JSON:', fileError.message);
                }
            }

            // Apply time filtering
            if (refresh === 'true') {
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                ads = ads.filter(ad => {
                    const adTime = new Date(ad.created_at || ad.timestamp).getTime();
                    return adTime > fiveMinutesAgo;
                });
            } else if (timeframe) {
                const timeframeMinutes = parseInt(timeframe);
                if (!isNaN(timeframeMinutes)) {
                    const timeframeAgo = Date.now() - (timeframeMinutes * 60 * 1000);
                    ads = ads.filter(ad => {
                        const adTime = new Date(ad.created_at || ad.timestamp).getTime();
                        return adTime > timeframeAgo;
                    });
                }
            }

            res.json(ads);
        } else {
            res.json([]);
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

// API endpoint to proxy image download
app.get('/api/download-image', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Image URL is required' });
    }

    try {
        const axios = require('axios');
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Get content type from response headers
        const contentType = response.headers['content-type'] || 'image/jpeg';

        // Set appropriate headers for download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'attachment; filename=image.jpg');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Send the image data
        res.send(Buffer.from(response.data));
    } catch (error) {
        console.error('Failed to download image:', error.message);
        res.status(500).json({ error: 'Failed to download image' });
    }
});

// API endpoint to export data
app.get('/api/export/:format', async (req, res) => {
    const { format } = req.params;
    const { session } = req.query;

    try {
        let ads = [];

        if (session) {
            // Export specific session
            const sessionFile = path.join(__dirname, 'data', 'sessions', session);
            if (await fs.exists(sessionFile)) {
                const sessionData = await fs.readJson(sessionFile);
                ads = sessionData.ads || [];
            }
        } else {
            // Export current session
            const currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
            if (await fs.exists(currentSessionFile)) {
                const currentSession = await fs.readJson(currentSessionFile);
                const sessionFile = path.join(__dirname, 'data', 'sessions', currentSession.sessionFile);
                if (await fs.exists(sessionFile)) {
                    const sessionData = await fs.readJson(sessionFile);
                    ads = sessionData.ads || [];
                }
            }
        }

        // If no session data, try legacy extracted_ads.json
        if (ads.length === 0) {
            const adsFile = path.join(__dirname, 'data', 'extracted_ads.json');
            if (await fs.exists(adsFile)) {
                ads = await fs.readJson(adsFile);
            }
        }

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
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data: ' + error.message });
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

// API endpoint to create a new session - Admin only
app.post('/api/sessions/new', requireAuth, requireAdmin, async (req, res) => {
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

// API endpoint to switch to a different session - Admin only
app.post('/api/sessions/switch', requireAuth, requireAdmin, async (req, res) => {
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

// Get active extractions endpoint
app.get('/api/extract/active', async (req, res) => {
    try {
        const activeExtractions = await backgroundExtractor.getActiveExtractions();
        console.log('📡 Active extractions requested:', activeExtractions.length);

        res.json({
            success: true,
            activeExtractions: activeExtractions.map(extraction => ({
                id: extraction.id,
                sessionId: extraction.sessionId,
                sessionFile: extraction.sessionFile,
                status: extraction.status,
                url: extraction.url,
                deviceMode: extraction.deviceMode,
                extractionMode: extraction.extractionMode,
                totalAds: extraction.totalAds || 0,
                startTime: extraction.startTime,
                logs: extraction.logs || [],
                progress: extraction.progress || 0,
                canResume: extraction.canResume || false,
                resumeData: extraction.resumeData || null
            }))
        });
    } catch (error) {
        console.error('Failed to get active extractions:', error);
        res.status(500).json({ error: 'Failed to get active extractions' });
    }
});

// Get all extraction status endpoint
app.get('/api/extract/status', async (req, res) => {
    try {
        const extractions = await backgroundExtractor.getExtractionStatus();
        res.json({
            success: true,
            extractions: extractions
        });
    } catch (error) {
        console.error('Failed to get extraction status:', error);
        res.status(500).json({ error: 'Failed to get extraction status' });
    }
});

// ============================================================================
// MULTI-THREAD EXTRACTION ENDPOINTS
// ============================================================================

// Start multi-thread extraction - Admin only
app.post('/api/extract/multi-thread/start', requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            maxWorkers = 3,
            deviceMode = 'desktop',
            sameUrl = false,
            url = 'https://www.newsbreak.com/new-york-ny'
        } = req.body;

        if (multiThreadExtractor && multiThreadExtractor.getStatus().isRunning) {
            return res.status(400).json({ error: 'Multi-thread extraction already running' });
        }

        // Validate maxWorkers
        if (maxWorkers < 1 || maxWorkers > 10) {
            return res.status(400).json({ error: 'maxWorkers must be between 1 and 10' });
        }

        if (sameUrl) {
            console.log(`🚀 Starting multi-thread extraction with ${maxWorkers} workers on SAME URL: ${url}`);
        } else {
            console.log(`🚀 Starting multi-thread extraction with ${maxWorkers} workers on DIFFERENT URLs`);
        }

        multiThreadExtractor = new MultiThreadExtractor({
            maxWorkers,
            deviceMode,
            restartOnFailure: true,
            sameUrl: sameUrl,
            baseUrl: sameUrl ? url : null
        });

        await multiThreadExtractor.start();

        res.json({
            success: true,
            message: sameUrl
                ? `Multi-thread extraction started with ${maxWorkers} workers on ${url}`
                : `Multi-thread extraction started with ${maxWorkers} workers on different cities`,
            status: multiThreadExtractor.getStatus()
        });

    } catch (error) {
        console.error('Failed to start multi-thread extraction:', error);
        res.status(500).json({ error: 'Failed to start multi-thread extraction', details: error.message });
    }
});

// Stop multi-thread extraction - Admin only
app.post('/api/extract/multi-thread/stop', requireAuth, requireAdmin, async (req, res) => {
    try {
        if (!multiThreadExtractor) {
            return res.status(400).json({ error: 'No multi-thread extraction running' });
        }

        console.log('🛑 Stopping multi-thread extraction...');
        await multiThreadExtractor.stop();

        res.json({
            success: true,
            message: 'Multi-thread extraction stopped',
            finalStats: multiThreadExtractor.getStatus()
        });

        multiThreadExtractor = null;

    } catch (error) {
        console.error('Failed to stop multi-thread extraction:', error);
        res.status(500).json({ error: 'Failed to stop multi-thread extraction', details: error.message });
    }
});

// Get multi-thread extraction status
app.get('/api/extract/multi-thread/status', async (req, res) => {
    try {
        if (!multiThreadExtractor) {
            return res.json({
                success: true,
                isRunning: false,
                message: 'No multi-thread extraction running'
            });
        }

        const status = multiThreadExtractor.getStatus();

        res.json({
            success: true,
            ...status
        });

    } catch (error) {
        console.error('Failed to get multi-thread status:', error);
        res.status(500).json({ error: 'Failed to get multi-thread status', details: error.message });
    }
});

// Get logs from specific worker or all workers
app.get('/api/extract/multi-thread/logs', async (req, res) => {
    try {
        if (!multiThreadExtractor) {
            return res.status(404).json({ error: 'No multi-thread extraction running' });
        }

        const { workerId, limit = 100 } = req.query;

        let logs;
        if (workerId) {
            logs = multiThreadExtractor.getWorkerLogs(parseInt(workerId), parseInt(limit));
        } else {
            logs = multiThreadExtractor.getAllLogs(parseInt(limit));
        }

        res.json({
            success: true,
            logs,
            count: logs.length
        });

    } catch (error) {
        console.error('Failed to get multi-thread logs:', error);
        res.status(500).json({ error: 'Failed to get logs', details: error.message });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

// Store SSE connections for real-time updates
const sseConnections = new Set();

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Real-time updates connected"}\n\n');

  // Add connection to active connections
  sseConnections.add(res);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(res);
  });

  req.on('aborted', () => {
    sseConnections.delete(res);
  });
});

// Function to broadcast updates to all connected clients
function broadcastUpdate(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;

  console.log(`📡 Broadcasting to ${sseConnections.size} clients:`, data.type);

  // Send to all connected clients
  sseConnections.forEach(connection => {
    try {
      connection.write(message);
    } catch (error) {
      console.warn('Failed to send SSE message, removing dead connection:', error.message);
      // Remove dead connections
      sseConnections.delete(connection);
    }
  });

  // Log if no connections available
  if (sseConnections.size === 0) {
    console.warn('⚠️ No SSE connections available for broadcast');
  }
}

// Initialize services
(async () => {
    try {
        // Initialize user manager first
        await userManager.initialize();
        console.log('User management service initialized');

        // Initialize background extractor
        await backgroundExtractor.initialize();
        console.log('Background extraction service initialized');

        // Override handleWorkerMessage to broadcast real-time updates
        const originalHandleWorkerMessage = backgroundExtractor.handleWorkerMessage;
        backgroundExtractor.handleWorkerMessage = async function(extractionId, message) {
          // Call original handler
          const result = await originalHandleWorkerMessage.call(this, extractionId, message);

          // Broadcast real-time updates
          if (message.type === 'ads_update') {
            const extraction = backgroundExtractor.activeExtractions.get(extractionId);
            broadcastUpdate({
              type: 'new_ads',
              extractionId: extractionId,
              sessionId: message.data.sessionId || extraction?.sessionId || null,
              newAds: message.data.newAds || [],
              totalAds: message.data.totalAds || 0,
              totalDbAds: message.data.totalDbAds || 0,
              latestAds: message.data.latestAds || [],
              databaseSaved: message.data.databaseSaved || false,
              timestamp: new Date().toISOString()
            });
          }

          if (message.type === 'status_update') {
            broadcastUpdate({
              type: 'status_update',
              extractionId: extractionId,
              status: message.data,
              timestamp: new Date().toISOString()
            });
          }

          if (message.type === 'session_created') {
            broadcastUpdate({
              type: 'session_created',
              extractionId: extractionId,
              sessionFile: message.data.sessionFile,
              sessionId: message.data.sessionId,
              timestamp: new Date().toISOString()
            });
          }

          if (message.type === 'log') {
            const level = message.data.level || 'info';
            const msg = message.data.message || '';

            // Broadcast most logs - filter out only very verbose debug logs
            const shouldBroadcast =
              level === 'warn' ||
              level === 'error' ||
              level === 'info' ||
              msg.includes('🔍') ||
              msg.includes('✅') ||
              msg.includes('❌') ||
              msg.includes('🔄') ||
              msg.includes('💾') ||
              msg.includes('📋') ||
              msg.includes('🔌') ||
              msg.includes('Total') ||
              msg.includes('new') ||
              msg.includes('ads') ||
              msg.includes('Scan') ||
              msg.includes('Saved') ||
              msg.includes('Found') ||
              msg.includes('completed') ||
              msg.includes('started');

            if (shouldBroadcast) {
              broadcastUpdate({
                type: 'log',
                extractionId: extractionId,
                message: message.data.message,
                level: level,
                timestamp: new Date().toISOString()
              });
            }
          }

          return result;
        };

    } catch (error) {
        console.error('Failed to initialize background extraction service:', error);
    }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await backgroundExtractor.cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await backgroundExtractor.cleanup();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`🚀 NewsBreak Ads Crawler Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
});

module.exports = app;