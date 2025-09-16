// AdsPower Current URL Extractor - Uses the current page open in AdsPower browser
const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./src/utils/logger');

class AdsPowerCurrentExtractor {
    constructor() {
        this.extractedAds = [];
        this.seenAds = new Set();
        this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.outputFile = path.join(__dirname, 'data', 'extracted_ads.json');
        this.sessionFile = path.join(__dirname, 'data', 'sessions', `ads_${this.sessionTimestamp}.json`);
    }

    async init() {
        // Ensure directories exist
        await fs.ensureDir(path.join(__dirname, 'data'));
        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

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
    }

    async connectToAdsPower() {
        logger.info('🔗 Connecting to AdsPower browser...');

        // Try common AdsPower debug ports
        const ports = [9222, 9223, 9224, 9225, 9226];

        for (const port of ports) {
            try {
                logger.info(`  Trying port ${port}...`);
                this.browser = await puppeteer.connect({
                    browserURL: `http://localhost:${port}`,
                    defaultViewport: null
                });
                logger.info(`✅ Connected to AdsPower on port ${port}`);
                return true;
            } catch (e) {
                // Continue trying other ports
            }
        }

        logger.error('❌ Could not connect to AdsPower browser');
        logger.info('💡 Make sure AdsPower is running with remote debugging enabled');
        logger.info('💡 In AdsPower: Settings → Browser Settings → Enable Remote Debug');
        return false;
    }

    async extract(scrollDuration = 300000) {
        logger.info(`\n🎯 AdsPower Current Page Extractor Started`);
        logger.info(`⏱️ Scroll duration: ${scrollDuration / 60000} minutes`);

        // Connect to AdsPower
        if (!await this.connectToAdsPower()) {
            throw new Error('Failed to connect to AdsPower browser');
        }

        // Get the current active page
        const pages = await this.browser.pages();
        if (pages.length === 0) {
            throw new Error('No pages found in AdsPower browser');
        }

        // Use the first page (or the active one)
        this.page = pages[0];

        // Get and log the current URL
        const currentUrl = await this.page.url();
        logger.info(`📍 Current URL: ${currentUrl}`);

        // Check if it's a NewsBreak page
        if (!currentUrl.includes('newsbreak.com')) {
            logger.warn('⚠️ Current page is not NewsBreak!');
            logger.info('📍 Navigating to NewsBreak...');

            // Navigate to NewsBreak if not already there
            await this.page.goto('https://www.newsbreak.com/new-york-ny', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            logger.info('✅ Navigated to NewsBreak');
        } else {
            logger.info('✅ Already on NewsBreak - using current page');
        }

        // Disable all clicking to prevent navigation
        await this.page.evaluate(() => {
            document.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }, true);

            // Also disable links
            document.querySelectorAll('a').forEach(link => {
                link.onclick = (e) => {
                    e.preventDefault();
                    return false;
                };
            });
        });

        logger.info('🔒 All clicks and navigation disabled');
        logger.info('🎯 Target: ForYou containers with iframes ONLY\n');

        // Start extraction loop
        const scanInterval = 5000;      // 5 seconds
        const scrollInterval = 15000;   // 15 seconds
        const maxScans = Math.floor(scrollDuration / scanInterval);
        const maxDuration = scrollDuration;

        const startTime = Date.now();
        let lastScrollTime = Date.now();
        let scanCount = 0;

        while (scanCount < maxScans && (Date.now() - startTime) < maxDuration) {
            logger.info(`\n🔍 Scan #${scanCount + 1}`);

            const newAds = await this.extractForYouAds();
            if (newAds.length > 0) {
                logger.info(`  ✨ Found ${newAds.length} new ads`);
                this.extractedAds.push(...newAds);
                await this.saveAds();
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
        logger.info(`📍 Extracted from: ${currentUrl}`);
    }

    async extractForYouAds() {
        const ads = await this.page.evaluate(() => {
            const foundAds = [];

            // Look for ForYou containers
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
                    iframeSrc: iframe.src || '',
                    pageUrl: window.location.href
                };

                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc && iframeDoc.body) {
                        // Extract ad content
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
                            }
                        }

                        // Extract ad link - multiple methods
                        const linkEl = iframeDoc.querySelector('a[href]');
                        if (linkEl && linkEl.href) {
                            adData.link = linkEl.href;
                        }

                        // Check iframe src for click URL
                        if (!adData.link && iframe.src) {
                            const urlParams = new URLSearchParams(iframe.src.split('?')[1] || '');
                            const clickUrl = urlParams.get('click_url') || urlParams.get('url');
                            if (clickUrl) {
                                adData.link = decodeURIComponent(clickUrl);
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin iframe
                    adData.advertiser = 'Protected Ad';
                    adData.headline = 'Cross-origin iframe';
                    adData.body = `Cannot access content (${adData.iframeSize})`;

                    if (iframe.src && iframe.src.includes('http')) {
                        adData.link = iframe.src;
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

        // Check if this session already exists
        const existingIndex = sessionsIndex.findIndex(s => s.timestamp === this.sessionTimestamp);
        const sessionData = {
            timestamp: this.sessionTimestamp,
            file: `ads_${this.sessionTimestamp}.json`,
            totalAds: this.extractedAds.length,
            endTime: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            sessionsIndex[existingIndex] = sessionData;
        } else {
            sessionsIndex.push(sessionData);
        }

        // Keep only last 50 sessions
        if (sessionsIndex.length > 50) {
            sessionsIndex = sessionsIndex.slice(-50);
        }

        await fs.writeJson(sessionsIndexFile, sessionsIndex, { spaces: 2 });
    }
}

// Main execution
async function main() {
    const extractor = new AdsPowerCurrentExtractor();

    try {
        await extractor.init();

        const scrollMinutes = parseInt(process.argv[2]) || 5;  // Default 5 minutes
        const scrollDuration = scrollMinutes * 60 * 1000;

        await extractor.extract(scrollDuration);

        logger.info(`\n📁 Saved to: ${extractor.outputFile}`);
        logger.info(`📊 Session file: ${extractor.sessionFile}`);
        logger.info('🌐 View in dashboard: http://localhost:3001/ui/enhanced-dashboard.html');
        logger.info('✅ Extraction complete - AdsPower browser left running');

    } catch (error) {
        logger.error('Extraction failed:', error.message);
    }

    // Don't close browser - leave AdsPower running
    process.exit(0);
}

main().catch(console.error);