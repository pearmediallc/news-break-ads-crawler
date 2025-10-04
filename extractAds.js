// ForYou Iframe Ad Extractor - ONLY extracts ads from ForYou containers on main page
// NO CLICKING, NO NAVIGATION, NO ARTICLE EXTRACTION

// Always use puppeteer in production (Docker), it has bundled Chrome
// Only fall back to puppeteer-core for local development without puppeteer
let puppeteer;
let isPuppeteerCore = false;
const isProduction = process.env.NODE_ENV === 'production';

// In production/Docker, always use puppeteer which includes Chrome
if (isProduction) {
    // Clear any conflicting environment variables that might interfere
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.CHROME_PATH;

    puppeteer = require('puppeteer');
} else {
    // For local development, try puppeteer first, then puppeteer-core
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        console.log('Using puppeteer-core instead of puppeteer');
        puppeteer = require('puppeteer-core');
        isPuppeteerCore = true;
    }
}
const fs = require('fs-extra');
const path = require('path');
const logger = require('./src/utils/logger');
const DatabaseSyncService = require('./src/database/syncService');

class ForYouAdExtractor {
    constructor(continueSession = false) {
        this.extractedAds = [];
        this.seenAds = new Set();
        this.continueSession = continueSession;
        this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Each session gets its own file - don't use the main extracted_ads.json
        this.sessionFile = path.join(__dirname, 'data', 'sessions', `session_${this.sessionTimestamp}.json`);
        // Keep a current session pointer
        this.currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
        this.dbSync = new DatabaseSyncService();
    }

    async init() {
        // Ensure data directories exist
        await fs.ensureDir(path.join(__dirname, 'data'));
        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

        // Initialize database sync
        try {
            await this.dbSync.initialize();
            logger.info('Database sync service initialized');
        } catch (error) {
            logger.warn('Database sync initialization failed, continuing without DB sync:', error.message);
        }

        // Only load previous session if we haven't already loaded a specific session
        // (switchToSession may have already been called)
        if (this.continueSession && this.extractedAds.length === 0) {
            await this.loadPreviousSession();
        } else if (this.extractedAds.length === 0) {
            logger.info('Starting new extraction session: ' + this.sessionTimestamp);
        } else {
            logger.info(`Continuing with ${this.extractedAds.length} loaded ads from session: ${path.basename(this.sessionFile)}`);
        }
        logger.info('Session file: ' + path.basename(this.sessionFile));

        // Launch Chrome directly - no need for AdsPower on US server
        logger.info('🚀 Launching Chrome browser...');

        // Check if running from spawn/server or directly
        const isSpawned = process.send !== undefined;

        const launchOptions = {
            // Headless in production or when spawned from server
            headless: isProduction || isSpawned ? 'new' : false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        };

        // In Docker/production with puppeteer package, it handles its own Chrome
        if (isProduction && !isPuppeteerCore) {
            // The puppeteer Docker image has Chrome installed via puppeteer
            // Let puppeteer handle finding its own Chrome installation
            logger.info('Using Puppeteer with its bundled Chrome (Docker/production mode)');

            // Try to get the executable path from puppeteer itself
            try {
                const execPath = puppeteer.executablePath();
                if (execPath && require('fs').existsSync(execPath)) {
                    logger.info(`Puppeteer Chrome found at: ${execPath}`);
                    // Don't set it in launchOptions - puppeteer knows where it is
                }
            } catch (e) {
                logger.info('Will let Puppeteer locate Chrome automatically');
            }
        }
        // In production with puppeteer-core, need to find Chrome manually
        else if (isProduction && isPuppeteerCore) {
            const possiblePaths = [
                process.env.PUPPETEER_EXECUTABLE_PATH,
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/google-chrome'
            ].filter(Boolean);

            for (const chromePath of possiblePaths) {
                if (require('fs').existsSync(chromePath)) {
                    launchOptions.executablePath = chromePath;
                    logger.info(`Found Chrome at: ${chromePath}`);
                    break;
                }
            }

            if (!launchOptions.executablePath) {
                throw new Error('puppeteer-core requires Chrome but none found in production');
            }
        }
        // Only set executablePath when using puppeteer-core locally (requires external Chrome)
        else if (isPuppeteerCore && !isProduction) {
            // Local development with puppeteer-core
            const chromePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.CHROME_PATH
            ].filter(Boolean);

            for (const path of chromePaths) {
                if (require('fs').existsSync(path)) {
                    launchOptions.executablePath = path;
                    logger.info(`Using Chrome at: ${path}`);
                    break;
                }
            }

            if (!launchOptions.executablePath) {
                throw new Error('puppeteer-core requires Chrome to be installed. Please install Chrome or set CHROME_PATH environment variable');
            }
        }

        try {
            this.browser = await puppeteer.launch(launchOptions);
            logger.info('✅ Chrome browser launched successfully');
        } catch (launchError) {
            logger.error(`Failed to launch browser with options: ${JSON.stringify(launchOptions)}`);
            logger.error(`Error: ${launchError.message}`);

            // If using executablePath failed, try without it (let puppeteer use its own)
            if (launchOptions.executablePath) {
                logger.info('Retrying without executablePath, using Puppeteer bundled browser...');
                delete launchOptions.executablePath;
                this.browser = await puppeteer.launch(launchOptions);
                logger.info('✅ Chrome browser launched with bundled browser');
            } else {
                throw launchError;
            }
        }

        // Create new page
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        logger.info('📄 New browser page created');

        // Set user agent to appear as regular Chrome
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        logger.info('Browser ready - Using server location (USA Virginia)');
    }

    async extract(url = 'https://www.newsbreak.com/new-york-ny', scrollDuration = 300000) {
        logger.info(`\n🎯 ForYou Ad Extractor Started`);
        logger.info(`📍 URL: ${url}`);
        logger.info(`🚫 NO CLICKING - Main page only`);
        logger.info(`🎯 Target: ForYou containers with iframes ONLY\n`);

        // Navigate to main page ONCE with longer timeout
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (timeoutError) {
            logger.info('Navigation timeout, but continuing anyway...');
            // Continue even if timeout - page might still be loading
        }
        logger.info('✅ On main page - will NOT navigate anywhere');

        // Wait for ForYou containers to load
        logger.info('⏳ Waiting for ForYou containers to load...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check what's on the page using enhanced selectors
        const pageInfo = await this.page.evaluate(() => {
            const forYouContainers = document.querySelectorAll('[id^="ForYou"], [id*="ForYou" i], [id*="foryou" i], [id*="for-you" i], [class*="ForYou"], [class*="for-you"], [class*="foryou" i], div[class*="ForYou"], div[class*="for-you"], section[class*="ForYou"], section[class*="for-you"]');
            const iframes = document.querySelectorAll('iframe');
            const sponsoredElements = document.querySelectorAll('[class*="sponsor"], [class*="promoted"], [class*="ad-"]');
            return {
                forYouCount: forYouContainers.length,
                iframeCount: iframes.length,
                sponsoredCount: sponsoredElements.length,
                forYouIds: Array.from(forYouContainers).slice(0, 5).map(el => el.id || el.className)
            };
        });

        logger.info(`📊 Page contains: ${pageInfo.forYouCount} ForYou containers, ${pageInfo.iframeCount} iframes, ${pageInfo.sponsoredCount} sponsored elements`);
        if (pageInfo.forYouIds.length > 0) {
            logger.info(`   Sample ForYou IDs: ${pageInfo.forYouIds.join(', ')}`);
        }
        logger.info('');

        // DISABLE ALL CLICKABLE ELEMENTS
        await this.page.evaluate(() => {
            // Remove all click handlers
            document.querySelectorAll('*').forEach(element => {
                element.onclick = null;
                element.onmousedown = null;
                element.onmouseup = null;
            });

            // Disable all links
            document.querySelectorAll('a').forEach(link => {
                link.removeAttribute('href');
                link.removeAttribute('target');
                link.style.pointerEvents = 'none';
                link.onclick = (e) => {
                    e.preventDefault();
                    return false;
                };
            });

            // Remove all target="_blank" attributes
            document.querySelectorAll('[target]').forEach(el => {
                el.removeAttribute('target');
            });

            // Disable iframes from navigation
            document.querySelectorAll('iframe').forEach(iframe => {
                iframe.style.pointerEvents = 'none';
            });
        });

        logger.info('🔒 All clicks and navigation disabled');
        await new Promise(resolve => setTimeout(resolve, 1000));  // Reduced wait

        const scanInterval = 3000;      // 3 seconds - slower scans for more content loading
        const scrollInterval = 2500;    // 2.5 seconds - slower scrolling
        const maxDuration = scrollDuration;  // User-defined duration

        logger.info(`🔍 Unlimited scans for ${Math.floor(maxDuration/1000)}s (scan every ${scanInterval/1000}s)`);

        const startTime = Date.now();
        let lastScrollTime = Date.now();
        let scanCount = 0;
        let refreshCount = 0;
        // No refresh limit - unlimited refreshes allowed

        // Initial scroll to trigger content loading
        logger.info('🎬 Starting auto-scroll...');
        await this.page.evaluate(() => {
            window.scrollBy(0, 500);  // Larger initial scroll
        });
        await new Promise(resolve => setTimeout(resolve, 500));  // Reduced wait

        while (Date.now() - startTime < maxDuration) {
            const timeRemaining = Math.max(0, maxDuration - (Date.now() - startTime));
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);
            logger.info(`\n🔍 Scan #${scanCount + 1} (${minutesRemaining}m ${secondsRemaining}s remaining)`);

            // Scroll BEFORE extracting (scroll first, then extract)
            if (Date.now() - lastScrollTime >= scrollInterval) {
                logger.info('📜 Auto-scrolling...');

                // Slower, smaller scroll increments for better content loading
                await this.page.evaluate(() => {
                    window.scrollBy({
                        top: window.innerHeight * 0.4,  // Smaller scroll increment
                        behavior: 'smooth'  // Smooth scroll for better content loading
                    });
                });
                await new Promise(resolve => setTimeout(resolve, 800));  // Wait longer for content to load

                lastScrollTime = Date.now();

                const isAtBottom = await this.page.evaluate(() => {
                    return window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
                });

                if (isAtBottom) {
                    // Wait longer before deciding to refresh - give content time to load
                    logger.info('📄 Near bottom, waiting for more content...');
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Check again if we're still at bottom after waiting
                    const stillAtBottom = await this.page.evaluate(() => {
                        return window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
                    });

                    if (!stillAtBottom) {
                        logger.info('✨ New content loaded, continuing scroll...');
                        continue; // Skip refresh, continue scrolling
                    }

                    refreshCount++;
                    logger.info(`🔄 Reached bottom, refreshing page for new content... (refresh #${refreshCount})`);

                    // Refresh the page to get new content
                    try {
                        await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                        logger.info('✅ Page refreshed successfully');
                    } catch (reloadError) {
                        logger.error('Page reload failed:', reloadError.message);
                        logger.info('Trying to continue without refresh...');

                        // If reload fails, try to scroll to top instead
                        try {
                            await this.page.evaluate(() => {
                                window.scrollTo({ top: 0, behavior: 'auto' });
                            });
                            logger.info('📄 Scrolled to top instead of refresh');
                        } catch (scrollError) {
                            logger.error('Scroll to top also failed:', scrollError.message);
                            logger.info('Continuing extraction anyway...');
                        }
                    }

                    // Wait for content to load
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Re-disable clicks after refresh
                    try {
                        await this.page.evaluate(() => {
                            // Remove all click handlers
                            document.querySelectorAll('*').forEach(element => {
                                element.onclick = null;
                                element.onmousedown = null;
                                element.onmouseup = null;
                            });

                            // Disable all links
                            document.querySelectorAll('a').forEach(link => {
                                link.removeAttribute('href');
                                link.removeAttribute('target');
                                link.style.pointerEvents = 'none';
                                link.onclick = (e) => {
                                    e.preventDefault();
                                    return false;
                                };
                            });

                            // Disable iframes from navigation
                            document.querySelectorAll('iframe').forEach(iframe => {
                                iframe.style.pointerEvents = 'none';
                            });
                        });

                        logger.info('🔒 Clicks disabled after refresh');
                    } catch (disableError) {
                        logger.error('Failed to disable clicks:', disableError.message);
                        logger.info('Continuing anyway...');
                    }
                }
            }

            // Extract ONLY from ForYou containers
            try {
                const newAds = await this.extractForYouAds();

                if (newAds.length > 0) {
                    logger.info(`✨ Found ${newAds.length} new ads`);
                    this.extractedAds.push(...newAds);
                    await this.saveAds();

                    newAds.forEach(ad => {
                        logger.info(`  📦 ${ad.advertiser || 'Ad'}: ${ad.headline || 'No headline'}`);
                    });
                } else {
                    logger.info(`  No new ads found`);
                }

                logger.info(`  Total: ${this.extractedAds.length} ads`);
            } catch (extractError) {
                logger.error('Error extracting ads:', extractError.message);
                logger.info('Continuing to next scan...');
            }

            await new Promise(resolve => setTimeout(resolve, scanInterval));
            scanCount++;
        }

        logger.info('\n✅ Extraction complete!');
        logger.info(`📊 Total ads: ${this.extractedAds.length}`);
    }

    async loadPreviousSession() {
        try {
            // Check if there's a current session pointer
            if (await fs.exists(this.currentSessionFile)) {
                const currentSession = await fs.readJson(this.currentSessionFile);
                const previousSessionFile = path.join(__dirname, 'data', 'sessions', currentSession.sessionFile);

                if (await fs.exists(previousSessionFile)) {
                    const previousData = await fs.readJson(previousSessionFile);

                    // Load previous ads and seen ads
                    this.extractedAds = previousData.ads || [];

                    // Rebuild seen ads set
                    for (const ad of this.extractedAds) {
                        const key = `${ad.advertiser}_${ad.headline}_${ad.body}`;
                        this.seenAds.add(key);
                    }

                    // Update session file to continue in the same file
                    this.sessionFile = previousSessionFile;
                    this.sessionTimestamp = previousData.sessionId || currentSession.sessionId;

                    logger.info(`✅ Continuing previous session: ${currentSession.sessionFile}`);
                    logger.info(`📊 Loaded ${this.extractedAds.length} existing ads`);
                    logger.info(`🔄 Will continue adding to the same session file`);

                    // Display existing ads from the session
                    if (this.extractedAds.length > 0) {
                        logger.info(`\n📜 Existing ads in this session:`);
                        this.extractedAds.forEach((ad, index) => {
                            logger.info(`  ${index + 1}. 📦 ${ad.advertiser || 'Unknown'}: ${ad.headline || 'No headline'}`);
                            if (ad.body) logger.info(`     "${ad.body.substring(0, 60)}${ad.body.length > 60 ? '...' : ''}"`);
                        });
                        logger.info('');
                    }
                } else {
                    logger.info('Previous session file not found, starting fresh');
                }
            } else {
                logger.info('No previous session found, starting fresh');
            }
        } catch (error) {
            logger.error('Error loading previous session:', error.message);
            logger.info('Starting fresh session instead');
        }
    }

    async switchToSession(sessionFileName) {
        try {
            const sessionFile = path.join(__dirname, 'data', 'sessions', sessionFileName);

            if (await fs.exists(sessionFile)) {
                const sessionData = await fs.readJson(sessionFile);

                // Clear current ads and load from selected session
                this.extractedAds = sessionData.ads || [];
                this.seenAds.clear();

                // Rebuild seen ads set
                for (const ad of this.extractedAds) {
                    const key = `${ad.advertiser}_${ad.headline}_${ad.body}`;
                    this.seenAds.add(key);
                }

                // Update current session pointer
                this.sessionFile = sessionFile;
                this.sessionTimestamp = sessionData.sessionId || sessionData.timestamp;

                // Update current session pointer file
                await fs.writeJson(this.currentSessionFile, {
                    sessionFile: sessionFileName,
                    timestamp: this.sessionTimestamp,
                    totalAds: this.extractedAds.length,
                    sessionId: this.sessionTimestamp
                }, { spaces: 2 });

                logger.info(`✅ Switched to session: ${sessionFileName}`);
                logger.info(`📊 Loaded ${this.extractedAds.length} ads from this session`);

                // Display existing ads from the session
                logger.info(`\n📜 Existing ads in this session:`);
                this.extractedAds.forEach((ad, index) => {
                    logger.info(`  ${index + 1}. 📦 ${ad.advertiser || 'Unknown'}: ${ad.headline || 'No headline'}`);
                    if (ad.body) logger.info(`     "${ad.body.substring(0, 60)}${ad.body.length > 60 ? '...' : ''}"`);
                });
                logger.info('');

                return true;
            } else {
                logger.error(`Session file not found: ${sessionFileName}`);
                return false;
            }
        } catch (error) {
            logger.error('Error switching session:', error.message);
            return false;
        }
    }

    async listSessions() {
        try {
            const sessionsIndexFile = path.join(__dirname, 'data', 'sessions', 'index.json');
            if (await fs.exists(sessionsIndexFile)) {
                const sessions = await fs.readJson(sessionsIndexFile);
                logger.info('\n📂 Available Sessions:');
                sessions.forEach((session, index) => {
                    logger.info(`  ${index + 1}. ${session.file} - ${session.totalAds} ads (${session.timestamp})`);
                });
                return sessions;
            } else {
                logger.info('No sessions found');
                return [];
            }
        } catch (error) {
            logger.error('Error listing sessions:', error.message);
            return [];
        }
    }

    async extractForYouAds() {
        const ads = await this.page.evaluate(() => {
            const foundAds = [];

            // ONLY EXTRACT FROM FORYOU CONTAINERS - these are the dynamic ad containers
            // Focus exclusively on ForYou pattern as these contain the dynamically updated ads
            const forYouSelectors = [
                '[id^="ForYou-"]',           // IDs starting with ForYou-
                '[id*="ForYou"]',             // IDs containing ForYou
                '[class*="ForYou"]',          // Classes containing ForYou
                '[class*="for-you"]',         // Classes with for-you
                'div[id*="foryou" i]',        // Divs with foryou (case insensitive)
                'div[class*="foryou" i]',     // Divs with foryou class (case insensitive)
                '.ForYou',                    // Direct ForYou class
                '#ForYou'                     // Direct ForYou ID
            ];

            // Query all ForYou containers
            const forYouContainers = document.querySelectorAll(forYouSelectors.join(', '));

            console.log(`Found ${forYouContainers.length} ForYou containers`);

            forYouContainers.forEach(container => {
                // Each ForYou container represents a potential ad slot
                const containerId = container.id || container.className || 'unnamed';
                console.log(`Processing ForYou container: ${containerId}`);

                // Check if this container has content (not empty)
                const hasContent = container.textContent.trim().length > 0 ||
                                 container.querySelector('iframe') ||
                                 container.querySelector('img');

                if (hasContent) {
                    // Look for iframe inside (most ads have iframes)
                    const iframe = container.querySelector('iframe');

                    // This is definitely an ad container if it has an iframe or sponsored content
                    const isAd = iframe ||
                               container.querySelector('[class*="sponsor" i], [class*="promoted" i], [class*="ad" i]') ||
                               container.textContent.toLowerCase().includes('sponsor') ||
                               container.textContent.toLowerCase().includes('promoted');

                    if (isAd || iframe) {
                        console.log(`  ✓ Ad detected in ForYou container: ${containerId}`);
                        foundAds.push({
                            container,
                            iframe,
                            type: 'ForYou',
                            containerId: containerId
                        });
                    } else if (hasContent) {
                        // Even without clear ad indicators, ForYou containers often have ads
                        // Check if it has substantial content
                        const hasSubstantialContent = container.querySelector('h1, h2, h3, h4, h5, h6, p') ||
                                                     container.querySelector('img') ||
                                                     container.textContent.trim().length > 50;

                        if (hasSubstantialContent) {
                            console.log(`  ? Possible ad in ForYou container: ${containerId}`);
                            foundAds.push({
                                container,
                                iframe: null,
                                type: 'ForYou-Content',
                                containerId: containerId
                            });
                        }
                    }
                } else {
                    console.log(`  - Empty ForYou container: ${containerId}`);
                }
            });

            // NO OTHER PATTERNS - ONLY FORYOU CONTAINERS
            // Removed all other patterns to focus exclusively on ForYou containers

            console.log(`Total potential ads found: ${foundAds.length}`);

            const extractedAds = [];
            foundAds.forEach(({ container, iframe, type, containerId }) => {
                if (!container && !iframe) return;

                const adData = {
                    id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    containerId: containerId || (container ? container.id : 'no-container'),
                    adType: type,
                    advertiser: '',
                    headline: '',
                    body: '',
                    image: '',
                    link: '',
                    iframeSize: iframe ? `${iframe.width || 'auto'}x${iframe.height || 'auto'}` : 'N/A',
                    iframeSrc: iframe ? (iframe.src || '') : ''
                };

                try {
                    // Try to extract from iframe if available
                    if (iframe) {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (iframeDoc && iframeDoc.body) {
                        // Extract from iframe
                        const advertiserEl = iframeDoc.querySelector('.ad-advertiser');
                        const headlineEl = iframeDoc.querySelector('.ad-headline');
                        const bodyEl = iframeDoc.querySelector('.ad-body');
                        const imageContainer = iframeDoc.querySelector('.ad-image-container');

                        adData.advertiser = advertiserEl ? advertiserEl.textContent.trim() : '';
                        adData.headline = headlineEl ? headlineEl.textContent.trim() : '';
                        adData.body = bodyEl ? bodyEl.textContent.trim() : '';

                        if (imageContainer) {
                            const img = imageContainer.querySelector('img');
                            if (img && img.src) {
                                adData.image = img.src;
                            } else {
                                const bgImage = window.getComputedStyle(imageContainer).backgroundImage;
                                if (bgImage && bgImage !== 'none') {
                                    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                                    if (match) adData.image = match[1];
                                }
                            }
                        }

                        // Extract ad link - try multiple methods
                        // Method 1: Look for anchor tags in iframe
                        const linkEl = iframeDoc.querySelector('a[href]');
                        if (linkEl && linkEl.href) {
                            adData.link = linkEl.href;
                        }

                        // Method 2: Look for click tracking in iframe attributes
                        if (!adData.link && iframe.src) {
                            // Check if iframe src contains a redirect URL
                            const urlParams = new URLSearchParams(iframe.src.split('?')[1] || '');
                            const clickUrl = urlParams.get('click_url') ||
                                           urlParams.get('clickUrl') ||
                                           urlParams.get('click') ||
                                           urlParams.get('url');
                            if (clickUrl) {
                                adData.link = decodeURIComponent(clickUrl);
                            }
                        }

                        // Method 3: Look for data attributes
                        if (!adData.link) {
                            const clickableEl = iframeDoc.querySelector('[data-click-url], [data-link], [data-href], [data-url]');
                            if (clickableEl) {
                                adData.link = clickableEl.getAttribute('data-click-url') ||
                                           clickableEl.getAttribute('data-link') ||
                                           clickableEl.getAttribute('data-href') ||
                                           clickableEl.getAttribute('data-url');
                            }
                        }

                        // Method 4: Look for onclick handlers or javascript URLs
                        if (!adData.link) {
                            const allElements = iframeDoc.querySelectorAll('*');
                            for (const el of allElements) {
                                const onclick = el.getAttribute('onclick');
                                if (onclick && onclick.includes('http')) {
                                    const match = onclick.match(/https?:\/\/[^\s'"]+/);
                                    if (match) {
                                        adData.link = match[0];
                                        break;
                                    }
                                }
                            }
                            }
                        }
                    } else if (container) {
                        // No iframe, extract directly from container
                        // Look for common ad text patterns
                        const textElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div');
                        textElements.forEach(el => {
                            const text = el.textContent.trim();
                            if (text && !adData.headline && el.tagName.match(/^H[1-6]$/)) {
                                adData.headline = text;
                            } else if (text && !adData.body && text.length > 20) {
                                adData.body = text;
                            }
                        });

                        // Look for advertiser name
                        const advertiserEl = container.querySelector('[class*="advertiser"], [class*="sponsor"], [class*="promoted-by"]');
                        if (advertiserEl) {
                            adData.advertiser = advertiserEl.textContent.trim();
                        }

                        // Look for images
                        const img = container.querySelector('img');
                        if (img && img.src) {
                            adData.image = img.src;
                        }

                        // Look for links
                        const link = container.querySelector('a[href]');
                        if (link && link.href) {
                            adData.link = link.href;
                        }
                    }
                } catch (e) {
                    // Cross-origin iframe - extract from surrounding ForYou container instead
                    if (iframe && container) {
                        // ForYou containers are dynamic ad slots - extract ALL visible content
                        // The ads load dynamically and content changes frequently

                        // Look for text content in the ForYou container (but not inside the iframe)
                        const containerClone = container.cloneNode(true);
                        // Remove the iframe from our clone to avoid confusion
                        const iframeClone = containerClone.querySelector('iframe');
                        if (iframeClone) iframeClone.remove();

                        // Extract ALL text elements from the container
                        const allTexts = [];
                        const textElements = containerClone.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, a, strong, b');

                        // Collect all text content
                        for (const el of textElements) {
                            const text = el.textContent.trim();
                            if (text && text.length > 5) {
                                // Skip common UI elements
                                if (!text.match(/^(Share|Comment|Like|Follow|Subscribe|Menu|Close|Next|Previous)$/i)) {
                                    allTexts.push({
                                        text: text,
                                        tag: el.tagName,
                                        fontSize: el.style.fontSize || '',
                                        fontWeight: el.style.fontWeight || '',
                                        isHeading: el.tagName.match(/^H[1-6]$/) ? true : false
                                    });
                                }
                            }
                        }

                        // Sort texts by likely importance (headings first, then by length)
                        allTexts.sort((a, b) => {
                            if (a.isHeading && !b.isHeading) return -1;
                            if (!a.isHeading && b.isHeading) return 1;
                            return b.text.length - a.text.length;
                        });

                        // Extract headline, body, and advertiser
                        for (const item of allTexts) {
                            const text = item.text;

                            // Headlines are typically short and prominent
                            if (!adData.headline && text.length > 10 && text.length < 150) {
                                if (item.isHeading || item.fontWeight === 'bold' || item.fontSize.includes('large')) {
                                    adData.headline = text;
                                }
                            }

                            // Body text is typically longer
                            else if (!adData.body && text.length > 30 && text.length < 500) {
                                // Skip if it's the same as headline
                                if (!adData.headline || !text.includes(adData.headline)) {
                                    adData.body = text;
                                }
                            }

                            // Look for advertiser patterns
                            else if (!adData.advertiser) {
                                if (text.match(/^(by|By|Sponsored by|Promoted by|From)\s+/i)) {
                                    adData.advertiser = text.replace(/^(by|By|Sponsored by|Promoted by|From)\s*/i, '');
                                } else if (text.length < 50 && (text.includes('Sponsored') || text.includes('Promoted'))) {
                                    adData.advertiser = text.replace(/(Sponsored|Promoted|Advertisement)/gi, '').trim();
                                }
                            }
                        }

                        // Look for advertiser in specific locations
                        const sponsorElement = container.querySelector('[class*="sponsor" i], [class*="advertiser" i], [class*="promoted" i]');
                        if (sponsorElement && !adData.advertiser) {
                            adData.advertiser = sponsorElement.textContent.trim().replace(/^(by|By|Sponsored by|Promoted by)\s*/i, '');
                        }

                        // Also check for "by" text pattern in spans
                        if (!adData.advertiser) {
                            const allSpans = container.querySelectorAll('span');
                            for (const span of allSpans) {
                                const spanText = span.textContent.trim();
                                if (spanText.match(/^(by|By|Sponsored by|Promoted by)\s+/i)) {
                                    adData.advertiser = spanText.replace(/^(by|By|Sponsored by|Promoted by)\s*/i, '');
                                    break;
                                }
                            }
                        }

                        // Look for images in the container (not in iframe)
                        const containerImg = container.querySelector('img:not(iframe img)');
                        if (containerImg && containerImg.src && !adData.image) {
                            adData.image = containerImg.src;
                        }

                        // Look for links in the container
                        const containerLink = container.querySelector('a[href]:not(iframe a)');
                        if (containerLink && containerLink.href && !adData.link) {
                            adData.link = containerLink.href;
                        }

                        // If still no content, use container ID as unique identifier
                        if (!adData.headline && !adData.body && !adData.advertiser) {
                            // Extract any visible text from the container
                            const visibleText = containerClone.textContent.trim().substring(0, 200);
                            if (visibleText && visibleText.length > 20) {
                                adData.body = visibleText;
                                adData.advertiser = `ForYou-${container.id || 'Ad'}`;
                            } else {
                                // Last resort - use iframe details
                                adData.advertiser = 'Sponsored Content';
                                adData.headline = `ForYou Ad ${container.id || ''}`;
                                adData.body = `Ad container (${adData.iframeSize})`;
                            }
                        }

                        // Add iframe src as additional data
                        if (iframe.src) {
                            adData.iframeSrc = iframe.src;
                            // Try to extract domain from iframe src as advertiser hint
                            if (!adData.advertiser || adData.advertiser === 'Sponsored Content') {
                                const srcUrl = new URL(iframe.src);
                                if (srcUrl.hostname && !srcUrl.hostname.includes('newsbreak')) {
                                    adData.advertiser = srcUrl.hostname.replace('www.', '').split('.')[0];
                                }
                            }
                        }
                    }
                }

                // Additional check: Look for click URL in container data attributes
                if (!adData.link) {
                    const containerClickUrl = container.getAttribute('data-click-url') ||
                                            container.getAttribute('data-link') ||
                                            container.getAttribute('data-ad-link');
                    if (containerClickUrl) {
                        adData.link = containerClickUrl;
                    }

                    // Check parent elements for click tracking
                    let parent = container.parentElement;
                    while (!adData.link && parent && parent !== document.body) {
                        const parentClickUrl = parent.getAttribute('data-click-url') ||
                                              parent.getAttribute('data-link') ||
                                              parent.getAttribute('data-ad-link');
                        if (parentClickUrl) {
                            adData.link = parentClickUrl;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }

                if (adData.advertiser || adData.headline || adData.body || adData.link) {
                    extractedAds.push(adData);
                }
            });

            console.log(`Extracted ${extractedAds.length} ads with content`);
            return extractedAds;
        });

        // ============================================================================
        // DUPLICATE FILTERING DISABLED - SHOW ALL ADS
        // ============================================================================
        // Filter duplicates - use more specific key for ForYou ads
        // const newAds = [];
        // for (const ad of ads) {
        //     // Create a more unique key that includes container ID for ForYou ads
        //     let key = `${ad.advertiser}_${ad.headline}_${ad.body}`;

        //     // For ForYou ads, include container ID to avoid false duplicates
        //     if (ad.adType === 'ForYou' && ad.containerId) {
        //         key = `${ad.containerId}_${ad.advertiser}_${ad.headline}`;
        //     }

        //     // For ads with minimal content, use iframe src as part of key
        //     if ((!ad.headline || !ad.body) && ad.iframeSrc) {
        //         key = `${ad.advertiser}_${ad.iframeSrc}`;
        //     }

        //     if (!this.seenAds.has(key)) {
        //         this.seenAds.add(key);
        //         newAds.push(ad);
        //         logger.info(`✅ New ad extracted: ${ad.advertiser || 'Unknown'} - ${ad.headline || ad.body || ad.containerId || 'ForYou Ad'}`);
        //     } else {
        //         logger.debug(`Duplicate ad skipped: ${ad.advertiser} - ${ad.headline}...`);
        //     }
        // }

        // return newAds;

        // SHOW ALL ADS WITHOUT FILTERING
        const newAds = ads;
        logger.info(`✅ Extracted ${newAds.length} ads (filtering disabled - showing all)`);
        newAds.forEach(ad => {
            logger.info(`  📦 ${ad.advertiser || 'Unknown'} - ${ad.headline || ad.body || ad.containerId || 'ForYou Ad'}`);
        });
        return newAds;
    }

    async saveAds() {
        // Ensure sessions directory exists
        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

        // Save session file with timestamp
        await fs.writeJson(this.sessionFile, {
            session: this.sessionTimestamp,
            timestamp: this.sessionTimestamp,
            startTime: this.sessionTimestamp,
            endTime: new Date().toISOString(),
            totalAds: this.extractedAds.length,
            ads: this.extractedAds,
            sessionId: this.sessionTimestamp
        }, { spaces: 2 });

        // Update current session pointer
        await fs.writeJson(this.currentSessionFile, {
            sessionFile: path.basename(this.sessionFile),
            timestamp: this.sessionTimestamp,
            totalAds: this.extractedAds.length,
            sessionId: this.sessionTimestamp
        }, { spaces: 2 });

        // Update sessions index
        const sessionsIndexFile = path.join(__dirname, 'data', 'sessions', 'index.json');
        let sessionsIndex = [];
        if (await fs.exists(sessionsIndexFile)) {
            sessionsIndex = await fs.readJson(sessionsIndexFile);
        }

        // Check if this session already exists in index
        const existingIndex = sessionsIndex.findIndex(s => s.file === path.basename(this.sessionFile));
        const sessionInfo = {
            timestamp: this.sessionTimestamp,
            file: path.basename(this.sessionFile),
            totalAds: this.extractedAds.length,
            endTime: new Date().toISOString(),
            sessionId: this.sessionTimestamp
        };

        if (existingIndex >= 0) {
            sessionsIndex[existingIndex] = sessionInfo;
        } else {
            sessionsIndex.unshift(sessionInfo);  // Add to beginning
        }

        // Keep only last 20 sessions
        if (sessionsIndex.length > 20) {
            sessionsIndex = sessionsIndex.slice(0, 20);
        }
        await fs.writeJson(sessionsIndexFile, sessionsIndex, { spaces: 2 });
    }

    async close() {
        if (this.browser) {
            try {
                await this.browser.close();
                logger.info('🔚 Browser closed successfully');
            } catch (e) {
                logger.error('Error closing browser:', e.message);
            }
        }
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let url = 'https://www.newsbreak.com/new-york-ny';
    let scrollMinutes = 5;
    let continueSession = false;
    let switchSession = null;
    let listSessions = false;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--continue' || arg === '-c') {
            continueSession = true;
        } else if (arg === '--switch' || arg === '-s') {
            switchSession = args[++i];
        } else if (arg === '--list' || arg === '-l') {
            listSessions = true;
        } else if (arg.startsWith('http')) {
            url = arg;
        } else if (!isNaN(parseFloat(arg))) {
            scrollMinutes = parseFloat(arg);
        }
    }

    const extractor = new ForYouAdExtractor(continueSession);

    try {
        // List sessions if requested
        if (listSessions) {
            await extractor.init();
            await extractor.listSessions();
            return;
        }

        // Switch to specific session BEFORE init if requested
        // This ensures we load the session data before browser initialization
        if (switchSession) {
            // Ensure directories exist first
            await fs.ensureDir(path.join(__dirname, 'data'));
            await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

            const success = await extractor.switchToSession(switchSession);
            if (!success) {
                logger.error('Failed to switch session. Starting new session instead.');
            } else {
                // Override continueSession since we're switching to a specific session
                continueSession = true;
            }
        }

        await extractor.init();

        // Ensure minimum duration of 30 seconds
        const scrollDuration = Math.max(scrollMinutes * 60 * 1000, 30000);
        const actualMinutes = scrollDuration / 60000;

        logger.info(`\n📍 URL: ${url}`);
        logger.info(`⏱️ Scroll duration: ${actualMinutes} minutes (${scrollDuration}ms)`);
        logger.info(`💾 Session mode: ${continueSession ? 'Continuing previous' : (switchSession ? `Switched to ${switchSession}` : 'New session')}`);

        await extractor.extract(url, scrollDuration);

        logger.info(`\n📁 Saved to: ${path.basename(extractor.sessionFile)}`);
        logger.info('🌐 View: Open ui/simple-ads.html');
        logger.info('✅ NO articles were extracted - ONLY ads from ForYou containers');

        // Show usage info
        logger.info('\n💡 Usage Tips:');
        logger.info('  --continue or -c    : Continue from last session');
        logger.info('  --switch <file> or -s : Switch to specific session');
        logger.info('  --list or -l        : List all available sessions');
        logger.info('  Example: node extractAds.js --continue https://newsbreak.com/local 10');

    } catch (error) {
        logger.error('Error:', error);
    } finally {
        await extractor.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ForYouAdExtractor;