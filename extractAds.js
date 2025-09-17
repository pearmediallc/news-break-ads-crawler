// ForYou Iframe Ad Extractor - ONLY extracts ads from ForYou containers on main page
// NO CLICKING, NO NAVIGATION, NO ARTICLE EXTRACTION

// Always use puppeteer in production (Docker), it has bundled Chrome
// Only fall back to puppeteer-core for local development without puppeteer
let puppeteer;
let isPuppeteerCore = false;
const isProduction = process.env.NODE_ENV === 'production';

// In production/Docker, always use puppeteer which includes Chrome
if (isProduction) {
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

class ForYouAdExtractor {
    constructor() {
        this.extractedAds = [];
        this.seenAds = new Set();
        this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Each session gets its own file - don't use the main extracted_ads.json
        this.sessionFile = path.join(__dirname, 'data', 'sessions', `session_${this.sessionTimestamp}.json`);
        // Keep a current session pointer
        this.currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
    }

    async init() {
        // Ensure data directories exist
        await fs.ensureDir(path.join(__dirname, 'data'));
        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

        // Start fresh for each session - no loading old ads
        logger.info('Starting new extraction session: ' + this.sessionTimestamp);
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
        await this.page.waitForTimeout(5000);

        // Check what's on the page
        const pageInfo = await this.page.evaluate(() => {
            const forYouContainers = document.querySelectorAll('[id^="ForYou"]');
            const iframes = document.querySelectorAll('iframe');
            const sponsoredElements = document.querySelectorAll('[class*="sponsor"], [class*="promoted"], [class*="ad-"]');
            return {
                forYouCount: forYouContainers.length,
                iframeCount: iframes.length,
                sponsoredCount: sponsoredElements.length,
                forYouIds: Array.from(forYouContainers).slice(0, 5).map(el => el.id)
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
        await new Promise(resolve => setTimeout(resolve, 3000));

        const scanInterval = 5000;      // 5 seconds
        const scrollInterval = 3000;    // 3 seconds - scroll more frequently
        const maxScans = Math.floor(scrollDuration / scanInterval);
        const maxDuration = scrollDuration;  // User-defined duration

        const startTime = Date.now();
        let lastScrollTime = Date.now();
        let scanCount = 0;

        // Initial scroll to trigger content loading
        logger.info('🎬 Starting auto-scroll...');
        await this.page.evaluate(() => {
            window.scrollBy(0, 300);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        while (scanCount < maxScans && (Date.now() - startTime < maxDuration)) {
            logger.info(`\n🔍 Scan #${scanCount + 1}`);

            // Scroll BEFORE extracting (scroll first, then extract)
            if (Date.now() - lastScrollTime >= scrollInterval) {
                logger.info('📜 Auto-scrolling...');

                // Smooth scroll with multiple small scrolls
                for (let i = 0; i < 3; i++) {
                    await this.page.evaluate(() => {
                        window.scrollBy({
                            top: window.innerHeight * 0.3,
                            behavior: 'smooth'
                        });
                    });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                lastScrollTime = Date.now();

                const isAtBottom = await this.page.evaluate(() => {
                    return window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
                });

                if (isAtBottom) {
                    logger.info('📄 Reached bottom, scrolling to top...');
                    await this.page.evaluate(() => {
                        window.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                        });
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Extract ONLY from ForYou containers
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

            await new Promise(resolve => setTimeout(resolve, scanInterval));
            scanCount++;
        }

        logger.info('\n✅ Extraction complete!');
        logger.info(`📊 Total ads: ${this.extractedAds.length}`);
    }

    async extractForYouAds() {
        const ads = await this.page.evaluate(() => {
            const foundAds = [];

            // Look for multiple possible ad container patterns
            // Pattern 1: ForYou containers (with or without hyphen)
            document.querySelectorAll('[id^="ForYou"]').forEach(container => {
                console.log('Found ForYou container:', container.id);
                const iframe = container.querySelector('iframe');
                if (iframe) {
                    console.log('  - Has iframe:', iframe.src || 'no src');
                    foundAds.push({ container, iframe, type: 'ForYou' });
                } else {
                    // Even without iframe, might still be an ad
                    const hasAdContent = container.querySelector('[class*="sponsor"], [class*="promoted"], [class*="ad"]');
                    if (hasAdContent) {
                        console.log('  - Has sponsored content');
                        foundAds.push({ container, iframe: null, type: 'ForYou-NoIframe' });
                    }
                }
            });

            // Pattern 2: Any iframes with mspai class (common ad iframe class)
            document.querySelectorAll('iframe[class*="mspai"], iframe[class*="nova"]').forEach(iframe => {
                // Check if not already captured
                if (!foundAds.find(ad => ad.iframe === iframe)) {
                    console.log('Found mspai/nova iframe:', iframe.className);
                    foundAds.push({ container: iframe.parentElement, iframe, type: 'MSPAI' });
                }
            });

            // Pattern 3: Generic iframes that might be ads
            document.querySelectorAll('iframe').forEach(iframe => {
                // Skip if already processed
                if (foundAds.find(ad => ad.iframe === iframe)) return;

                const src = iframe.src || '';
                const className = iframe.className || '';
                const id = iframe.id || '';

                // Common ad indicators
                if (src.includes('ad') || src.includes('sponsor') ||
                    className.includes('ad') || className.includes('sponsor') ||
                    id.includes('ad') || id.includes('sponsor')) {
                    console.log('Found generic ad iframe:', src.substring(0, 50));
                    foundAds.push({ container: iframe.parentElement, iframe, type: 'Generic' });
                }
            });

            // Pattern 4: Divs with sponsored content indicators
            document.querySelectorAll('[class*="sponsor"], [class*="promoted"], [class*="ad-"], [data-ad], [data-sponsor]').forEach(container => {
                // Skip if already processed
                if (!foundAds.find(ad => ad.container === container)) {
                    console.log('Found sponsored container:', container.className || container.tagName);
                    foundAds.push({ container, iframe: null, type: 'Sponsored' });
                }
            });

            console.log(`Total potential ads found: ${foundAds.length}`);

            const extractedAds = [];
            foundAds.forEach(({ container, iframe, type }) => {
                if (!container && !iframe) return;

                const adData = {
                    id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    containerId: container ? container.id : 'no-container',
                    adType: type,
                    advertiser: '',
                    headline: '',
                    body: '',
                    image: '',
                    link: '',
                    iframeSize: iframe ? `${iframe.width}x${iframe.height}` : 'N/A',
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
                    // Cross-origin iframe or error
                    if (iframe) {
                        adData.advertiser = 'Protected Ad';
                        adData.headline = 'Cross-origin iframe';
                        adData.body = `Cannot access content (${adData.iframeSize})`;

                        // For cross-origin, try to extract URL from iframe src
                        if (iframe.src && iframe.src.includes('http')) {
                            adData.link = iframe.src;
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

        // Filter duplicates
        const newAds = [];
        for (const ad of ads) {
            const key = `${ad.advertiser}_${ad.headline}_${ad.body}`;
            if (!this.seenAds.has(key)) {
                this.seenAds.add(key);
                newAds.push(ad);
            }
        }

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
    const extractor = new ForYouAdExtractor();

    try {
        await extractor.init();

        const url = process.argv[2] || 'https://www.newsbreak.com/new-york-ny';
        const scrollMinutes = parseInt(process.argv[3]) || 5;  // Default 5 minutes
        const scrollDuration = scrollMinutes * 60 * 1000;

        logger.info(`⏱️ Scroll duration: ${scrollMinutes} minutes`);
        await extractor.extract(url, scrollDuration);

        logger.info(`\n📁 Saved to: ${extractor.outputFile}`);
        logger.info('🌐 View: Open ui/simple-ads.html');
        logger.info('✅ NO articles were extracted - ONLY ads from ForYou containers');

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