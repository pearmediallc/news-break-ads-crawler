// Enhanced AdsPower Extractor with API integration
const axios = require('axios');
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    puppeteer = require('puppeteer-core');
}
const fs = require('fs-extra');
const path = require('path');
const logger = require('./src/utils/logger');

const ADSPOWER_API = 'http://localhost:50325/api/v1';

class AdsPowerExtractor {
    constructor() {
        this.extractedAds = [];
        this.seenAds = new Set();
        this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Each session gets its own file
        this.sessionFile = path.join(__dirname, 'data', 'sessions', `session_${this.sessionTimestamp}.json`);
        // Keep a current session pointer
        this.currentSessionFile = path.join(__dirname, 'data', 'current_session.json');
    }

    async init() {
        await fs.ensureDir(path.join(__dirname, 'data'));
        await fs.ensureDir(path.join(__dirname, 'data', 'sessions'));

        // Start fresh for each session - no loading old ads
        logger.info('Starting new extraction session: ' + this.sessionTimestamp);
        logger.info('Session file: ' + path.basename(this.sessionFile));
    }

    async connectViaAPI() {
        logger.info('🔗 Detecting active AdsPower profiles...');

        try {
            // First, get all profiles to check which one is active
            const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);
            if (!profilesResponse.data || !profilesResponse.data.data) {
                throw new Error('Could not get profiles list');
            }

            const allProfiles = profilesResponse.data.data.list;
            logger.info(`Found ${allProfiles.length} total profiles in AdsPower`);

            if (allProfiles.length === 1) {
                logger.info(`Only one profile available: ${allProfiles[0].name || allProfiles[0].user_id}`);
            } else {
                logger.info('Available profiles:');
                allProfiles.forEach((p, i) => {
                    logger.info(`  ${i + 1}. ${p.name || p.user_id}`);
                });
            }

            let activeProfile = null;
            let activeProfileInfo = null;

            // Check each profile to find active one
            for (const profile of allProfiles) {
                try {
                    const statusResponse = await axios.get(`${ADSPOWER_API}/browser/active`, {
                        params: { user_id: profile.user_id }
                    });

                    if (statusResponse.data && statusResponse.data.data) {
                        const browserInfo = statusResponse.data.data;

                        if (browserInfo.status === 'Active' && browserInfo.ws && browserInfo.ws.puppeteer) {
                            activeProfile = profile;
                            activeProfileInfo = browserInfo;
                            logger.info(`✅ Found active profile: ${profile.name || profile.user_id}`);
                            break;
                        }
                    }
                } catch (e) {
                    // Profile not active, continue checking
                }
            }

            // If found active profile, connect to it
            if (activeProfile && activeProfileInfo) {
                logger.info(`Connecting to active browser: ${activeProfile.name}`);
                this.browser = await puppeteer.connect({
                    browserWSEndpoint: activeProfileInfo.ws.puppeteer,
                    defaultViewport: null
                });
                logger.info('✅ Connected to active profile via WebSocket!');
                return true;
            }

            // If no active browser, let user know
            logger.info('❌ No active AdsPower browser found!');
            logger.info('💡 Please open an AdsPower browser profile first, then try again');
            logger.info('');
            logger.info('Available profiles:');

            allProfiles.forEach((profile, index) => {
                logger.info(`  ${index + 1}. ${profile.name || profile.user_id}`);
            });

            logger.info('');
            logger.info('To start a profile:');
            logger.info('1. Open AdsPower application');
            logger.info('2. Click "Open" next to any profile');
            logger.info('3. Run the extraction again');

            // Try to start first profile as fallback
            if (allProfiles.length > 0) {
                logger.info('');
                logger.info('Attempting to start first profile automatically...');
                const profile = allProfiles[0];
                logger.info(`Starting browser for profile: ${profile.name || profile.user_id}`);

                // Start browser (without launch_args which causes issues)
                const startResponse = await axios.get(`${ADSPOWER_API}/browser/start`, {
                    params: {
                        user_id: profile.user_id,
                        open_tabs: 1
                    }
                });

                if (startResponse.data && startResponse.data.data) {
                    const browserData = startResponse.data.data;

                    if (browserData.ws && browserData.ws.puppeteer) {
                        this.browser = await puppeteer.connect({
                            browserWSEndpoint: browserData.ws.puppeteer,
                            defaultViewport: null
                        });
                        logger.info('✅ Connected to new browser!');
                        return true;
                    }
                }
            }

            throw new Error('Could not connect to any browser');

        } catch (error) {
            logger.error('API connection failed:', error.message);
            if (error.response && error.response.data) {
                logger.error('API response:', JSON.stringify(error.response.data));
            }
            return false;
        }
    }

    async extract(url = 'https://www.newsbreak.com', duration = 5) {
        logger.info('🎯 AdsPower Extractor with USA IP');
        logger.info(`⏱️ Duration: ${duration} minutes`);

        // Try API connection first
        if (!await this.connectViaAPI()) {
            throw new Error('Failed to connect to AdsPower');
        }

        // Get pages
        const pages = await this.browser.pages();
        if (pages.length === 0) {
            this.page = await this.browser.newPage();
        } else {
            this.page = pages[0];
        }

        // Navigate if needed
        const currentUrl = await this.page.url();
        if (!currentUrl.includes('newsbreak.com')) {
            logger.info('📍 Navigating to NewsBreak...');
            await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
        }

        logger.info('✅ Ready to extract with USA IP!');

        // Start auto-scrolling and extraction
        const scrollDuration = duration * 60000;
        const startTime = Date.now();
        let scanCount = 0;

        // Initial scroll
        logger.info('🎬 Starting auto-scroll...');
        await this.page.evaluate(() => {
            window.scrollBy(0, 300);
        });

        while ((Date.now() - startTime) < scrollDuration) {
            scanCount++;
            logger.info(`\n🔍 Scan #${scanCount}`);

            // Smooth scroll
            for (let i = 0; i < 3; i++) {
                await this.page.evaluate(() => {
                    window.scrollBy({
                        top: window.innerHeight * 0.3,
                        behavior: 'smooth'
                    });
                });
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Extract ads
            const newAds = await this.extractAds();
            if (newAds.length > 0) {
                logger.info(`✨ Found ${newAds.length} new ads`);
                this.extractedAds.push(...newAds);
                await this.saveAds();
            }

            logger.info(`📊 Total: ${this.extractedAds.length} ads`);

            // Check if at bottom
            const isAtBottom = await this.page.evaluate(() => {
                return window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
            });

            if (isAtBottom) {
                logger.info('📄 Reached bottom, scrolling to top...');
                await this.page.evaluate(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        logger.info('\n✅ Extraction complete!');
        logger.info(`📊 Total ads extracted: ${this.extractedAds.length}`);
    }

    async extractAds() {
        const pageInfo = await this.page.evaluate(() => {
            const foundAds = [];
            const debug = {
                forYouCount: 0,
                iframeCount: 0,
                totalElements: 0
            };

            // Debug: Count ForYou containers
            const forYouContainers = document.querySelectorAll('[id*="ForYou"], [id*="foryou"], [id*="for-you"]');
            debug.forYouCount = forYouContainers.length;
            console.log(`Found ${forYouContainers.length} ForYou containers`);

            // Look for ForYou containers with ads
            forYouContainers.forEach(container => {
                const iframe = container.querySelector('iframe');
                if (iframe) {
                    debug.iframeCount++;
                    console.log('Found iframe in container:', container.id, iframe.src);
                }

                // Try to extract ad content from the container
                const adData = {
                    id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    containerId: container.id || '',
                    adType: 'ForYou'
                };

                // Look for any text content that might be an ad
                const allText = container.innerText || container.textContent || '';
                if (allText && allText.length > 20) {
                    // Split text into lines and try to identify parts
                    const lines = allText.split('\n').filter(line => line.trim().length > 0);
                    if (lines.length > 0) {
                        adData.headline = lines[0];
                        if (lines.length > 1) {
                            adData.body = lines.slice(1).join(' ').substring(0, 200);
                        }
                    }
                }

                // Look for advertiser info more broadly
                const advertiserSelectors = [
                    '[class*="advertiser"]',
                    '[class*="sponsor"]',
                    '[class*="promoted"]',
                    '[data-testid*="advertiser"]',
                    'span:first-child',
                    'div:first-child > span'
                ];

                for (const selector of advertiserSelectors) {
                    const advertiserEl = container.querySelector(selector);
                    if (advertiserEl && advertiserEl.textContent.trim()) {
                        adData.advertiser = advertiserEl.textContent.trim();
                        break;
                    }
                }

                // Look for images
                const imgEl = container.querySelector('img');
                if (imgEl) {
                    adData.image = imgEl.src || imgEl.getAttribute('data-src');
                }

                // Look for links
                const linkEl = container.querySelector('a[href]');
                if (linkEl) {
                    adData.link = linkEl.href;
                }

                // Get iframe details if present
                if (iframe) {
                    adData.iframeSize = `${iframe.width || 0}x${iframe.height || 0}`;
                    adData.iframeSrc = iframe.src || '';
                }

                // Add if we have any content
                if (adData.headline || adData.body || adData.advertiser || iframe) {
                    foundAds.push(adData);
                }
            });

            // Also look for any iframes that might be ads (broader search)
            const allIframes = document.querySelectorAll('iframe');
            debug.totalElements = allIframes.length;
            console.log(`Total iframes on page: ${allIframes.length}`);

            allIframes.forEach(iframe => {
                const src = iframe.src || '';
                // Check if it looks like an ad iframe
                if (src.includes('ad') || src.includes('sponsor') || src.includes('promoted') ||
                    iframe.className.includes('ad') || iframe.id.includes('ad')) {

                    // Check if we already captured this iframe
                    const alreadyCaptured = foundAds.some(ad => ad.iframeSrc === src);
                    if (!alreadyCaptured) {
                        const adData = {
                            id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: new Date().toISOString(),
                            containerId: iframe.id || iframe.className || 'unknown',
                            adType: 'iframe-ad',
                            iframeSrc: src,
                            iframeSize: `${iframe.width || 0}x${iframe.height || 0}`,
                            headline: 'Ad Frame Detected',
                            body: `Ad iframe: ${src.substring(0, 100)}`
                        };
                        foundAds.push(adData);
                    }
                }
            });

            return { ads: foundAds, debug };
        });

        // Log debug info
        if (pageInfo.debug.forYouCount === 0 && pageInfo.debug.iframeCount === 0) {
            logger.info(`⚠️ No ForYou containers or iframes found. Page might need more time to load.`);
        } else {
            logger.info(`📊 Page stats: ${pageInfo.debug.forYouCount} ForYou containers, ${pageInfo.debug.iframeCount} iframes with ads`);
        }

        // Filter new ads based on unique key
        const newAds = [];
        for (const ad of pageInfo.ads) {
            const key = `${ad.advertiser || ''}_${ad.headline || ''}_${ad.body || ''}_${ad.iframeSrc || ''}`;
            if (!this.seenAds.has(key) && key.length > 5) {
                this.seenAds.add(key);
                newAds.push(ad);
            }
        }

        return newAds;
    }

    async saveAds() {
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

        // Keep only last 50 sessions
        if (sessionsIndex.length > 50) {
            sessionsIndex = sessionsIndex.slice(-50);
        }
        await fs.writeJson(sessionsIndexFile, sessionsIndex, { spaces: 2 });
    }

    async close() {
        if (this.browser) {
            await this.browser.disconnect();
        }
    }
}

// Main execution
async function main() {
    const url = process.argv[2] || 'https://www.newsbreak.com';
    const duration = parseInt(process.argv[3]) || 5;

    const extractor = new AdsPowerExtractor();

    try {
        await extractor.init();
        await extractor.extract(url, duration);
    } catch (error) {
        logger.error('Extraction failed:', error.message);
    } finally {
        await extractor.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = AdsPowerExtractor;