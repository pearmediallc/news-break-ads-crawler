// ForYou Iframe Ad Extractor - ONLY extracts ads from ForYou containers on main page
// NO CLICKING, NO NAVIGATION, NO ARTICLE EXTRACTION

// Try to use puppeteer-core if puppeteer is not available
let puppeteer;
let isPuppeteerCore = false;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.log('Using puppeteer-core instead of puppeteer');
    puppeteer = require('puppeteer-core');
    isPuppeteerCore = true;
}
const fs = require('fs-extra');
const path = require('path');
const logger = require('./src/utils/logger');

class ForYouAdExtractor {
    constructor() {
        this.extractedAds = [];
        this.seenAds = new Set();
        this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.outputFile = path.join(__dirname, 'data', 'extracted_ads.json');
        this.sessionFile = path.join(__dirname, 'data', 'sessions', `ads_${this.sessionTimestamp}.json`);
    }

    async init() {
        // Ensure data directory exists
        await fs.ensureDir(path.join(__dirname, 'data'));

        // Load existing ads to avoid duplicates
        if (await fs.exists(this.outputFile)) {
            try {
                const existing = await fs.readJson(this.outputFile);
                this.extractedAds = existing;
                existing.forEach(ad => {
                    const key = `${ad.advertiser}_${ad.headline}_${ad.body}`;
                    this.seenAds.add(key);
                });
                logger.info(`Loaded ${existing.length} existing ads`);
            } catch (error) {
                logger.info('Starting fresh extraction');
            }
        }

        // Launch browser with visible window to see what's happening
        const launchOptions = {
            headless: false,  // VISIBLE BROWSER - to debug ad loading
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        };

        // If using puppeteer-core, need to specify Chrome path
        if (isPuppeteerCore) {
            // Try common Chrome locations
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
        }

        this.browser = await puppeteer.launch(launchOptions);

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });

        logger.info('Browser ready with visible window - no clicking possible');
    }

    async extract(url = 'https://www.newsbreak.com/new-york-ny', scrollDuration = 300000) {
        logger.info(`\n🎯 ForYou Ad Extractor Started`);
        logger.info(`📍 URL: ${url}`);
        logger.info(`🚫 NO CLICKING - Main page only`);
        logger.info(`🎯 Target: ForYou containers with iframes ONLY\n`);

        // Navigate to main page ONCE with longer timeout
        try {
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (timeoutError) {
            logger.info('Navigation timeout, but continuing anyway...');
            // Continue even if timeout - page might still be loading
        }
        logger.info('✅ On main page - will NOT navigate anywhere\n');

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
        const scrollInterval = 15000;   // 15 seconds
        const maxScans = Math.floor(scrollDuration / scanInterval);
        const maxDuration = scrollDuration;  // User-defined duration

        const startTime = Date.now();
        let lastScrollTime = Date.now();
        let scanCount = 0;

        while (scanCount < maxScans && (Date.now() - startTime < maxDuration)) {
            logger.info(`\n🔍 Scan #${scanCount + 1}`);

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

            // Scroll every 15 seconds
            if (Date.now() - lastScrollTime >= scrollInterval) {
                logger.info('\n📜 Scrolling (15 seconds passed)...');
                await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.7));
                lastScrollTime = Date.now();

                const isAtBottom = await this.page.evaluate(() => {
                    return window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
                });

                if (isAtBottom) {
                    logger.info('At bottom, going to top...');
                    await this.page.evaluate(() => window.scrollTo(0, 0));
                }
            }

            await new Promise(resolve => setTimeout(resolve, scanInterval));
            scanCount++;
        }

        logger.info('\n✅ Extraction complete!');
        logger.info(`📊 Total ads: ${this.extractedAds.length}`);
    }

    async extractForYouAds() {
        const ads = await this.page.evaluate(() => {
            const foundAds = [];

            // ONLY look for ForYou containers
            document.querySelectorAll('[id^="ForYou-"]').forEach(container => {
                const iframe = container.querySelector('iframe.mspai-nova-native');
                if (!iframe) return;

                const adData = {
                    id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    containerId: container.id,
                    advertiser: '',
                    headline: '',
                    body: '',
                    image: '',
                    link: '',
                    iframeSize: `${iframe.width}x${iframe.height}`,
                    iframeSrc: iframe.src || ''
                };

                try {
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
                } catch (e) {
                    // Cross-origin iframe
                    adData.advertiser = 'Protected Ad';
                    adData.headline = 'Cross-origin iframe';
                    adData.body = `Cannot access content (${adData.iframeSize})`;

                    // For cross-origin, try to extract URL from iframe src
                    if (iframe.src && iframe.src.includes('http')) {
                        adData.link = iframe.src;
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

                if (adData.advertiser || adData.headline || adData.body) {
                    foundAds.push(adData);
                }
            });

            return foundAds;
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

        // Save to main file
        await fs.writeJson(this.outputFile, this.extractedAds, { spaces: 2 });

        // Save session file with timestamp
        await fs.writeJson(this.sessionFile, {
            session: this.sessionTimestamp,
            startTime: this.sessionTimestamp,
            endTime: new Date().toISOString(),
            totalAds: this.extractedAds.length,
            ads: this.extractedAds
        }, { spaces: 2 });

        // Save latest for dashboard
        const latestFile = path.join(__dirname, 'data', 'latest_ads.json');
        await fs.writeJson(latestFile, this.extractedAds.slice(-50), { spaces: 2 });

        // Update sessions index
        const sessionsIndexFile = path.join(__dirname, 'data', 'sessions', 'index.json');
        let sessionsIndex = [];
        if (await fs.exists(sessionsIndexFile)) {
            sessionsIndex = await fs.readJson(sessionsIndexFile);
        }
        sessionsIndex.push({
            timestamp: this.sessionTimestamp,
            file: `ads_${this.sessionTimestamp}.json`,
            totalAds: this.extractedAds.length,
            endTime: new Date().toISOString()
        });
        // Keep only last 50 sessions
        if (sessionsIndex.length > 50) {
            sessionsIndex = sessionsIndex.slice(-50);
        }
        await fs.writeJson(sessionsIndexFile, sessionsIndex, { spaces: 2 });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
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