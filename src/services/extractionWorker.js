const { parentPort, workerData } = require('worker_threads');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

// Worker logger that sends messages to parent
const logger = {
  info: (message) => parentPort.postMessage({ type: 'log', data: { message, level: 'info' } }),
  warn: (message) => parentPort.postMessage({ type: 'log', data: { message, level: 'warn' } }),
  error: (message) => parentPort.postMessage({ type: 'log', data: { message, level: 'error' } }),
  debug: (message) => parentPort.postMessage({ type: 'log', data: { message, level: 'debug' } })
};

class WorkerAdExtractor {
  constructor() {
    this.extractedAds = [];
    this.seenAds = new Set();
    this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionFile = path.join(process.cwd(), 'data', 'sessions', `worker_${this.sessionTimestamp}.json`);
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.startTime = Date.now();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Increased for unlimited mode
    this.lastSaveTime = Date.now();
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 15; // Stop after 15 consecutive errors
    this.lastBrowserRestart = Date.now();
    this.totalDbAds = 0; // Track total ads saved to database
  }

  async initialize() {
    try {
      await fs.ensureDir(path.join(process.cwd(), 'data', 'sessions'));

      // Check if resuming from existing session
      if (workerData.resumeFrom) {
        await this.resumeFromSession(workerData.resumeFrom);
      }

      // Initialize browser with reconnection support
      await this.initializeBrowser();

      // Notify parent about session creation or resumption
      parentPort.postMessage({
        type: 'session_created',
        data: {
          sessionId: this.sessionTimestamp,
          sessionFile: path.basename(this.sessionFile),
          resumed: !!workerData.resumeFrom
        }
      });

    } catch (error) {
      logger.error(`Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  async resumeFromSession(sessionFileName) {
    try {
      const sessionPath = path.join(process.cwd(), 'data', 'sessions', sessionFileName);

      if (await fs.exists(sessionPath)) {
        const sessionData = await fs.readJson(sessionPath);

        // Load existing ads and rebuild seen ads set
        this.extractedAds = sessionData.ads || [];
        this.seenAds.clear();

        for (const ad of this.extractedAds) {
          const key = `${ad.headline}_${ad.body}_${ad.image}_${ad.advertiser}`;
          this.seenAds.add(key);
        }

        // Update session file path and timestamp
        this.sessionFile = sessionPath;
        this.sessionTimestamp = sessionData.sessionId || sessionData.timestamp;

        logger.info(`✅ Resumed from session: ${sessionFileName}`);
        logger.info(`📊 Loaded ${this.extractedAds.length} existing ads`);

        // Update last save time to prevent immediate saves
        this.lastSaveTime = Date.now();

      } else {
        logger.warn(`⚠️ Session file not found: ${sessionFileName}, starting fresh`);
      }
    } catch (error) {
      logger.error(`Failed to resume from session: ${error.message}`);
      logger.info('Starting fresh session instead');
    }
  }

  async extractAds() {
    try {
      const extractionMode = workerData.extractionMode;
      const ads = await this.page.evaluate((mode) => {
        const foundAds = [];

        console.log(`Starting NewsBreak ad extraction (${mode} mode)...`);

        if (mode === 'unlimited') {
          // UNLIMITED MODE: FOCUS ONLY ON ForYou CONTAINERS
          console.log('🎯 UNLIMITED MODE: Focusing on ForYou containers only');

          // Primary ForYou containers with enhanced selectors
          const forYouSelectors = [
            '[id^="ForYou"]',
            '[id*="ForYou" i]',
            '[id*="foryou" i]',
            '[id*="for-you" i]',
            '[class*="ForYou"]',
            '[class*="for-you"]',
            '[class*="foryou" i]',
            '[class*="for_you" i]',
            'div[class*="ForYou"]',
            'div[class*="for-you"]',
            'section[class*="ForYou"]',
            'section[class*="for-you"]',
            '[data-testid*="foryou" i]',
            '[data-testid*="ForYou" i]',
            '[data-testid*="for-you" i]'
          ];

          forYouSelectors.forEach(selector => {
            try {
              const containers = document.querySelectorAll(selector);
              if (containers.length > 0) {
                console.log(`Found ${containers.length} containers with "${selector}"`);
              }

              containers.forEach((container, index) => {
                // Skip if already processed
                if (foundAds.find(ad => ad.container === container)) return;

                // Check for iframe (primary ad indicator)
                const iframe = container.querySelector('iframe');
                if (iframe) {
                  console.log('✅ ForYou container with iframe:', container.id || container.className);
                  foundAds.push({ container, iframe, type: 'ForYou-Iframe' });
                  return;
                }

                // Check for ad-related content even without iframe
                const hasAdContent = container.querySelector('[class*="sponsor"], [class*="promoted"], [class*="ad"], [class*="Sponsor"], [class*="Promoted"]') ||
                                   container.textContent.toLowerCase().includes('sponsored') ||
                                   container.textContent.toLowerCase().includes('promoted');

                if (hasAdContent) {
                  console.log('✅ ForYou sponsored content:', container.id || container.className);
                  foundAds.push({ container, iframe: null, type: 'ForYou-Sponsored' });
                }
              });
            } catch (e) {
              console.warn('Error with selector:', selector, e.message);
            }
          });

          console.log(`🎯 UNLIMITED MODE: Found ${foundAds.length} ForYou ads`);

          // Fallback: If no ForYou containers found, try alternative approaches
          if (foundAds.length === 0) {
            // Try common iframe selectors as fallback
            const fallbackIframes = document.querySelectorAll('iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="amazon-adsystem"], iframe[class*="ad"], iframe[id*="ad"]');

            fallbackIframes.forEach((iframe, index) => {
              if (index < 10) { // Limit to 10 fallback ads per scan
                const container = iframe.closest('div, section, article') || iframe.parentElement;
                foundAds.push({ container, iframe, type: 'Fallback-Iframe' });
              }
            });

            // Try looking for any sponsored content
            const sponsoredElements = document.querySelectorAll('[class*="sponsor" i], [class*="promoted" i], [data-ad], [data-sponsor]');

            sponsoredElements.forEach((element, index) => {
              if (index < 5 && !foundAds.find(ad => ad.container === element)) { // Limit to 5 sponsored elements
                foundAds.push({ container: element, iframe: null, type: 'Fallback-Sponsored' });
              }
            });

            if (foundAds.length > 0) {
              console.log(`🔄 Fallback detection found ${foundAds.length} potential ads`);
            }
          }

        } else {
          // TIMED MODE: USE COMPREHENSIVE EXTRACTION
          console.log('🔍 TIMED MODE: Using comprehensive ad detection');

          // PATTERN 1: ForYou containers (highest priority) - Same selectors as unlimited mode
          const forYouSelectors = [
            '[id^="ForYou"]',
            '[id*="ForYou" i]',
            '[id*="foryou" i]',
            '[id*="for-you" i]',
            '[class*="ForYou"]',
            '[class*="for-you"]',
            '[class*="foryou" i]',
            '[class*="for_you" i]',
            'div[class*="ForYou"]',
            'div[class*="for-you"]',
            'section[class*="ForYou"]',
            'section[class*="for-you"]',
            '[data-testid*="foryou" i]',
            '[data-testid*="ForYou" i]',
            '[data-testid*="for-you" i]'
          ];

          forYouSelectors.forEach(selector => {
            try {
              const containers = document.querySelectorAll(selector);

              containers.forEach((container, index) => {
                // Skip if already processed
                if (foundAds.find(ad => ad.container === container)) return;

                // Check for iframe (primary ad indicator)
                const iframe = container.querySelector('iframe');
                if (iframe) {
                  foundAds.push({ container, iframe, type: 'ForYou' });
                  return;
                }

                // Check for ad-related content even without iframe
                const hasAdContent = container.querySelector('[class*="sponsor"], [class*="promoted"], [class*="ad"], [class*="Sponsor"], [class*="Promoted"]') ||
                                   container.textContent.toLowerCase().includes('sponsored') ||
                                   container.textContent.toLowerCase().includes('promoted');

                if (hasAdContent) {
                  foundAds.push({ container, iframe: null, type: 'ForYou-NoIframe' });
                }
              });
            } catch (e) {
              console.warn('Error with selector:', selector, e.message);
            }
          });

          // Add the same fallback logic as unlimited mode
          if (foundAds.length === 0) {
            // Try common iframe selectors as fallback
            const fallbackIframes = document.querySelectorAll('iframe[src*="doubleclick"], iframe[src*="googlesyndication"], iframe[src*="amazon-adsystem"], iframe[class*="ad"], iframe[id*="ad"]');

            fallbackIframes.forEach((iframe, index) => {
              if (index < 10) { // Limit to 10 fallback ads per scan
                const container = iframe.closest('div, section, article') || iframe.parentElement;
                foundAds.push({ container, iframe, type: 'Fallback-Iframe' });
              }
            });

            // Try looking for any sponsored content
            const sponsoredElements = document.querySelectorAll('[class*="sponsor" i], [class*="promoted" i], [data-ad], [data-sponsor]');

            sponsoredElements.forEach((element, index) => {
              if (index < 5 && !foundAds.find(ad => ad.container === element)) { // Limit to 5 sponsored elements
                foundAds.push({ container: element, iframe: null, type: 'Fallback-Sponsored' });
              }
            });
          }

          // PATTERN 2: Ad network iframes
          document.querySelectorAll('iframe[class*="mspai"], iframe[class*="nova"], iframe[id*="google_ads"], iframe[name*="google_ads"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"]').forEach(iframe => {
            if (!foundAds.find(ad => ad.iframe === iframe)) {
              foundAds.push({ container: iframe.parentElement, iframe, type: 'AdNetwork' });
            }
          });

          // PATTERN 3: Sponsored content containers
          document.querySelectorAll('[class*="sponsor" i], [class*="promoted" i], [class*="ad-" i], [class*="advertisement" i], [data-ad], [data-sponsor], [data-promoted]').forEach(container => {
            if (!foundAds.find(ad => ad.container === container)) {
              foundAds.push({ container, iframe: null, type: 'Sponsored' });
            }
          });
        }


        // Extract data from all found ads
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

                // Extract ad link
                const linkEl = iframeDoc.querySelector('a[href]');
                if (linkEl && linkEl.href) {
                  adData.link = linkEl.href;
                }

                // Look for click tracking in iframe attributes
                if (!adData.link && iframe.src) {
                  const urlParams = new URLSearchParams(iframe.src.split('?')[1] || '');
                  const clickUrl = urlParams.get('click_url') ||
                                 urlParams.get('clickUrl') ||
                                 urlParams.get('click') ||
                                 urlParams.get('url');
                  if (clickUrl) {
                    adData.link = decodeURIComponent(clickUrl);
                  }
                }
              }
            }

            // Extract from container if no iframe or couldn't extract from iframe
            if (container && (!adData.headline && !adData.body)) {
              // FILTER: Skip main page containers that aren't actually ads
              const containerId = container.id || '';
              const containerClass = container.className || '';

              // Skip main page containers
              const invalidContainers = ['__next', 'root', 'main', 'body', 'header', 'footer', 'nav', 'content'];
              const isInvalidContainer = invalidContainers.some(invalid =>
                containerId.toLowerCase().includes(invalid) ||
                containerClass.toLowerCase().includes(invalid)
              );

              if (!isInvalidContainer) {
                // Look for common ad text patterns (but limit text length to prevent page dumps)
                const textElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, [class*="title"], [class*="headline"], [class*="description"], [class*="summary"]');
                textElements.forEach(el => {
                  const text = el.textContent.trim();
                  // Limit text length to prevent capturing entire page content
                  if (text && text.length <= 200 && !adData.headline && (el.tagName.match(/^H[1-6]$/) || el.className.includes('title') || el.className.includes('headline'))) {
                    adData.headline = text;
                  } else if (text && text.length > 20 && text.length <= 500 && !adData.body) {
                    adData.body = text;
                  }
                });

                // Look for advertiser name
                const advertiserEl = container.querySelector('[class*="advertiser"], [class*="sponsor"], [class*="promoted-by"], [class*="source"]');
                if (advertiserEl) {
                  const advertiserText = advertiserEl.textContent.trim();
                  if (advertiserText.length <= 100) { // Limit advertiser name length
                    adData.advertiser = advertiserText;
                  }
                }

                // Look for images
                const img = container.querySelector('img');
                if (img && img.src) {
                  adData.image = img.src || img.dataset.src || img.dataset.lazySrc || '';
                }

                // Look for links
                const link = container.querySelector('a[href]') || container.closest('a[href]');
                if (link && link.href) {
                  adData.link = link.href;
                }
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
          if (!adData.link && container) {
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

          // VALIDATION: Only save if it's a valid ad with reasonable content
          const hasValidContent = (adData.advertiser || adData.headline || adData.body || adData.link) &&
                                  (!adData.body || adData.body.length <= 1000) && // Prevent page dumps
                                  (!adData.headline || adData.headline.length <= 300) && // Reasonable headline length
                                  (!adData.advertiser || adData.advertiser.length <= 150); // Reasonable advertiser length

          // Additional check: Skip if body contains navigation/page elements
          const containsPageElements = adData.body && (
            adData.body.includes('Sign In') ||
            adData.body.includes('About NewsBreak') ||
            adData.body.includes('Terms of Use') ||
            adData.body.includes('Privacy Policy') ||
            adData.body.includes('See all locations') ||
            adData.body.includes('emoji_like') ||
            adData.body.length > 800
          );

          if (hasValidContent && !containsPageElements) {
            extractedAds.push(adData);
          }
        });

        if (extractedAds.length > 0) {
          console.log(`✅ Extracted ${extractedAds.length} valid ads`);
        }
        return extractedAds;
      }, extractionMode);

      // Filter new ads
      const newAds = ads.filter(ad => {
        const key = `${ad.headline}_${ad.body}_${ad.image}_${ad.advertiser}`;
        if (this.seenAds.has(key)) return false;
        this.seenAds.add(key);
        return true;
      });

      if (newAds.length > 0) {
        // ADD TO DATABASE FIRST - Primary storage
        await this.saveToDatabase(newAds);

        // Add to memory for immediate processing (but limit size)
        this.extractedAds.push(...newAds);
        logger.info(`✨ Found ${newAds.length} new ads`);
        newAds.forEach(ad => {
          logger.info(`  📦 ${ad.advertiser || ad.adType}: ${ad.headline || 'No headline'}`);
          if (ad.body && ad.adType !== 'IframeAd') {
            logger.info(`     "${ad.body.substring(0, 60)}${ad.body.length > 60 ? '...' : ''}"`);
          }
        });

        // NO ADS DELETION - All ads preserved in database and session
        // Memory management done only through browser restarts and garbage collection

        logger.info(`  Total in memory: ${this.extractedAds.length} ads`);

        // Save to session file (with current memory state)
        await this.saveSession();

        // Notify parent about new ads
        parentPort.postMessage({
          type: 'ads_update',
          data: {
            totalAds: this.extractedAds.length, // Memory count
            newAds: newAds,
            latestAds: this.extractedAds.slice(-10),
            databaseSaved: true // Flag indicating DB save
          }
        });
      } else {
        logger.info(`  No new ads found`);
      }

      return newAds.length;
    } catch (error) {
      logger.error(`Failed to extract ads: ${error.message}`);
      return 0;
    }
  }

  async scrollAndWait() {
    try {
      // Check current scroll position
      const scrollInfo = await this.page.evaluate(() => {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        return { currentScroll, maxScroll, atBottom: currentScroll >= maxScroll - 100 };
      });

      if (scrollInfo.atBottom) {
        // At bottom, refresh page for new content
        logger.info(`🔄 Reached bottom, refreshing page for new content...`);
        try {
          await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          logger.info(`✅ Page refreshed successfully`);
        } catch (reloadError) {
          logger.warn(`⚠️ Reload failed, trying fallback: ${reloadError.message}`);
          try {
            await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            logger.info(`✅ Page refreshed with fallback`);
          } catch (fallbackError) {
            logger.error(`❌ Both reload attempts failed, continuing without refresh`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // Regular scroll
        const scrollDistance = Math.floor(Math.random() * 800) + 400;
        await this.page.evaluate((distance) => {
          window.scrollBy(0, distance);
        }, scrollDistance);
      }

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
    } catch (error) {
      logger.warn(`Scroll error: ${error.message}`);
    }
  }

  async handleBrowserDisconnection() {
    logger.info('🔄 Handling browser disconnection - saving current data...');

    // Save current data first
    try {
      await this.saveSession();
      logger.info('✅ Current data saved successfully');
    } catch (saveError) {
      logger.error('❌ Failed to save data on disconnect:', saveError.message);
    }

    // Attempt to reconnect if we haven't exceeded max attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

      try {
        // Progressive wait time for reconnection attempts
        const waitTime = Math.min(3000 + (this.reconnectAttempts * 2000), 15000);
        logger.info(`⏳ Waiting ${waitTime/1000}s before reconnection...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Clean shutdown of browser resources
        try {
          if (this.page && !this.page.isClosed()) {
            await this.page.close().catch(() => {});
          }
          if (this.browser && this.browser.isConnected()) {
            await this.browser.close().catch(() => {});
          }
        } catch (cleanupError) {
          logger.warn('Cleanup error during reconnection:', cleanupError.message);
        }

        // Clear references
        this.page = null;
        this.browser = null;

        // Reinitialize browser with retry logic
        await this.initializeBrowser();

        // Verify browser is actually working
        await this.page.evaluate(() => document.title);

        logger.info('✅ Browser reconnected and verified - continuing extraction');

        // Reset reconnect attempts on successful reconnection
        this.reconnectAttempts = 0;

      } catch (reconnectError) {
        logger.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, reconnectError.message);

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.error('❌ Maximum reconnection attempts reached - stopping extraction');
          this.isRunning = false;
        } else {
          logger.info(`🔄 Will retry reconnection automatically...`);
          // Don't use setTimeout here, let the main loop handle retry
        }
      }
    } else {
      logger.error('❌ Maximum reconnection attempts reached - stopping extraction');
      this.isRunning = false;
    }
  }

  async initializeBrowser() {
    // Auto-detect headless mode: use headless for production/deployment, GUI for development
    const isProduction = process.env.NODE_ENV === 'production' ||
                         process.env.DEPLOYMENT === 'true' ||
                         !process.env.DISPLAY; // No display available (Linux servers)

    logger.info(`🖥️ Browser Mode: ${isProduction ? 'Headless (Server/Production)' : 'GUI (Development)'}`);

    // Retry browser launch up to 3 times
    let browserLaunched = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`🚀 Browser launch attempt ${attempt}/3...`);

        this.browser = await puppeteer.launch({
          headless: isProduction ? 'new' : false,  // Headless in production, GUI in development
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-features=VizDisplayCompositor',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images', // Faster loading
            '--disable-javascript-harmony-shipping',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--max-old-space-size=4096', // Increase memory limit for long sessions
            // Additional server/deployment flags
            '--disable-web-security',
            '--disable-ipc-flooding-protection',
            // Stability improvements
            '--disable-crash-reporter',
            '--disable-software-rasterizer',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            // Remove problematic flags for Windows
            ...(isProduction ? [
              '--disable-gpu-sandbox',
              '--disable-features=VizDisplayCompositor,VizHitTestSurfaceLayer'
            ] : [])
          ],
          defaultViewport: null,
          ignoreDefaultArgs: ['--enable-automation'],
          ignoreHTTPSErrors: true,
          // Add timeout for browser launch
          timeout: 30000
        });

        browserLaunched = true;
        logger.info('✅ Browser launched successfully');
        break;

      } catch (error) {
        lastError = error;
        logger.warn(`❌ Browser launch attempt ${attempt} failed: ${error.message}`);

        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
      }
    }

    if (!browserLaunched) {
      throw new Error(`Failed to launch browser after 3 attempts. Last error: ${lastError?.message}`);
    }

    // Handle browser disconnection for long sessions
    this.browser.on('disconnected', () => {
      logger.warn('⚠️ Browser disconnected - attempting reconnection...');
      if (this.isRunning) {
        this.handleBrowserDisconnection();
      }
    });

    this.page = await this.browser.newPage();

    // Set device mode with proper configuration
    if (workerData.deviceMode === 'mobile') {
      await this.page.emulate({
        name: 'iPhone 12',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      });
      logger.info(`📱 Mobile mode configured: iPhone 12 (390x844)`);
    } else {
      // Desktop mode with proper user agent
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      logger.info(`🖥️ Desktop mode configured: 1920x1080`);
    }

    // Navigate to URL with increased timeout and better error handling
    logger.info(`🌐 Loading ${workerData.url}...`);

    try {
      await this.page.goto(workerData.url, {
        waitUntil: 'networkidle2',
        timeout: 80000 // 80 seconds as requested
      });
      logger.info(`✅ Page loaded successfully`);
    } catch (navError) {
      if (navError.message.includes('timeout')) {
        logger.warn(`⏰ Navigation timeout, trying with domcontentloaded...`);
        try {
          await this.page.goto(workerData.url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });
          logger.info(`✅ Page loaded with domcontentloaded`);
        } catch (fallbackError) {
          logger.error(`❌ Failed to load page even with fallback: ${fallbackError.message}`);
          throw new Error(`Failed to load NewsBreak page. Please check your internet connection and try again.`);
        }
      } else {
        throw navError;
      }
    }

    // Wait for content to fully load
    logger.info(`⏳ Waiting for content to load...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Basic page check for production
    try {
      const pageInfo = await this.page.evaluate(() => {
        const forYouByClass = document.querySelectorAll('[class*="ForYou"], [class*="for-you"], [class*="foryou"]');
        const forYouById = document.querySelectorAll('[id*="ForYou"], [id*="for-you"], [id*="foryou"]');
        const totalIframes = document.querySelectorAll('iframe').length;

        return {
          totalIframes,
          forYouByClass: forYouByClass.length,
          forYouById: forYouById.length
        };
      });

      logger.info(`📊 Page ready: ${pageInfo.totalIframes} iframes, ${pageInfo.forYouByClass + pageInfo.forYouById} ForYou containers`);
    } catch (debugError) {
      logger.warn(`Page check failed: ${debugError.message}`);
    }
  }

  async saveToDatabase(newAds) {
    try {
      // Import database module only when needed
      const DatabaseSyncService = require('../database/syncService');
      const dbSync = new DatabaseSyncService();

      // Force initialization with better error handling
      await dbSync.initialize();

      // Verify tables exist before saving
      const testResult = await dbSync.db.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ads'");
      if (!testResult) {
        logger.warn('Ads table does not exist, reinitializing database schema...');
        await dbSync.db.initializeSchema();
      }

      await dbSync.syncAds(newAds, this.sessionTimestamp);

      this.totalDbAds += newAds.length;
      logger.info(`💾 Saved ${newAds.length} ads to database (total DB: ${this.totalDbAds})`);

      await dbSync.close();
    } catch (error) {
      logger.warn(`Database save failed: ${error.message}`);
      // Continue without DB - don't crash extraction
    }
  }

  async saveSession() {
    try {
      const sessionData = {
        sessionId: this.sessionTimestamp,
        startTime: this.sessionTimestamp,
        url: workerData.url,
        duration: workerData.duration,
        deviceMode: workerData.deviceMode,
        extractionMode: workerData.extractionMode,
        endTime: new Date().toISOString(),
        totalAds: this.extractedAds.length, // All ads in memory
        totalDbAds: this.totalDbAds, // Database count
        ads: this.extractedAds, // ALL EXTRACTED ADS - NEVER TRUNCATED
        note: 'All extracted ads preserved in session file'
      };

      await fs.writeJson(this.sessionFile, sessionData, { spaces: 2 });

      // Update sessions index to show in UI
      const sessionsIndexFile = path.join(process.cwd(), 'data', 'sessions', 'index.json');
      let sessionsIndex = [];
      if (await fs.exists(sessionsIndexFile)) {
        sessionsIndex = await fs.readJson(sessionsIndexFile);
      }

      // Remove any existing entry for this session
      sessionsIndex = sessionsIndex.filter(s => s.sessionId !== this.sessionTimestamp);

      // Add current session
      sessionsIndex.unshift({
        file: path.basename(this.sessionFile),
        timestamp: this.sessionTimestamp,
        totalAds: this.extractedAds.length, // Memory count
        totalDbAds: this.totalDbAds, // Database count
        sessionId: this.sessionTimestamp
      });

      // Keep only last 50 sessions to prevent file bloat
      if (sessionsIndex.length > 50) {
        sessionsIndex = sessionsIndex.slice(0, 50);
      }

      await fs.writeJson(sessionsIndexFile, sessionsIndex, { spaces: 2 });
      logger.info(`📝 Session saved: ${this.extractedAds.length} in memory, ${this.totalDbAds} in database`);
    } catch (error) {
      logger.error(`Failed to save session: ${error.message}`);
    }
  }

  async restartBrowser() {
    try {
      logger.info('🔄 Restarting browser for memory cleanup...');

      // Save current data before restart
      await this.saveSession();

      // Clean shutdown
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }

      // Clear references
      this.page = null;
      this.browser = null;

      // Force garbage collection
      if (global.gc) {
        global.gc();
        logger.info('🗑️ Forced garbage collection');
      }

      // Wait before restart
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reinitialize browser
      await this.initializeBrowser();

      this.lastBrowserRestart = Date.now();
      this.reconnectAttempts = 0; // Reset reconnect attempts

      logger.info('✅ Browser restarted successfully');

    } catch (error) {
      logger.error(`Failed to restart browser: ${error.message}`);
      throw error; // Let caller handle the error
    }
  }

  async run() {
    this.isRunning = true;

    try {
      await this.initialize();

      parentPort.postMessage({
        type: 'status_update',
        data: { status: 'running' }
      });

      const durationMs = workerData.extractionMode === 'unlimited' ?
        Infinity :
        (workerData.duration || 5) * 60 * 1000;

      let extractionCount = 0;
      let refreshCount = 0;

      logger.info(`\n🎯 NewsBreak Ad Extractor Started`);
      logger.info(`📍 URL: ${workerData.url}`);
      logger.info(`⏱️ Duration: ${workerData.extractionMode === 'unlimited' ? 'Unlimited' : workerData.duration + ' minutes'}`);
      logger.info(`📱 Device: ${workerData.deviceMode}`);
      logger.info(`🚫 NO CLICKING - Main page only`);

      if (workerData.extractionMode === 'unlimited') {
        logger.info(`🎯 UNLIMITED MODE: Targeting ONLY ForYou containers for optimal extraction`);
      } else {
        logger.info(`🎯 TIMED MODE: Using comprehensive ad detection`);
      }
      logger.info(``);

      // Initial extraction
      await this.extractAds();

      while (this.isRunning && (Date.now() - this.startTime) < durationMs) {
        extractionCount++;

        // Scroll and wait (skip if browser disconnected)
        try {
          if (this.browser && this.browser.isConnected() && this.page) {
            await this.scrollAndWait();
          } else {
            logger.warn(`⚠️ Skipping scroll - browser not connected`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
            continue;
          }
        } catch (scrollError) {
          logger.warn(`⚠️ Scroll error: ${scrollError.message}`);

          // Check if it's a browser disconnection
          if (!this.browser || !this.browser.isConnected()) {
            logger.warn(`🔄 Browser disconnected during scroll - waiting for reconnection...`);
            continue; // Let the extraction error handling below deal with reconnection
          }
        }

        // Extract ads after scrolling
        try {
          await this.extractAds();
          this.consecutiveErrors = 0; // Reset error counter on success
        } catch (extractError) {
          this.consecutiveErrors++;
          logger.warn(`⚠️ Extraction error #${this.consecutiveErrors} (continuing): ${extractError.message}`);

          // Stop if too many consecutive errors
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            logger.error(`❌ Too many consecutive errors (${this.consecutiveErrors}) - stopping extraction`);
            break;
          }

          // Check if browser is still connected
          if (!this.browser || !this.browser.isConnected()) {
            logger.warn(`🔄 Browser disconnected during extraction - attempting reconnection...`);

            try {
              await this.handleBrowserDisconnection();
              if (this.browser && this.browser.isConnected()) {
                logger.info(`✅ Browser reconnected successfully`);
                this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 2); // Reduce error count on successful reconnection
                continue;
              }
            } catch (reconnectError) {
              logger.error(`❌ Reconnection failed: ${reconnectError.message}`);
              if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                logger.error(`❌ Max reconnection attempts reached - stopping extraction`);
                break;
              }
            }
          } else {
            // Browser connected but extraction failed - wait before retry
            logger.info(`⏳ Waiting 5 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          // Check if page is still alive
          try {
            await this.page.evaluate(() => document.title);
          } catch (pageError) {
            logger.error(`❌ Page crashed, attempting recovery...`);

            // Try to reload the page
            try {
              await this.page.goto(workerData.url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              });
              logger.info(`✅ Page recovered successfully`);
            } catch (recoveryError) {
              logger.error(`❌ Page recovery failed: ${recoveryError.message}`);
              // Continue anyway - might be a temporary issue
            }
          }
        }

        // Update progress for timed extractions
        if (workerData.extractionMode === 'timed') {
          const elapsed = Date.now() - this.startTime;
          const progress = Math.min((elapsed / durationMs) * 100, 100);

          parentPort.postMessage({
            type: 'status_update',
            data: {
              status: 'running',
              progress: Math.round(progress)
            }
          });
        }

        // Log progress every 10 extractions
        if (extractionCount % 10 === 0) {
          const elapsed = Math.round((Date.now() - this.startTime) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          logger.info(`\n🔍 Scan #${extractionCount} (${minutes}m ${seconds}s elapsed)`);
          logger.info(`  Total: ${this.extractedAds.length} ads`);

          // Enhanced memory management for unlimited extractions
          if (workerData.extractionMode === 'unlimited') {
            const memUsage = process.memoryUsage();
            const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const totalMB = Math.round(memUsage.rss / 1024 / 1024);
            logger.info(`  Memory: ${heapMB}MB heap, ${totalMB}MB total | DB: ${this.totalDbAds} ads saved`);

            // More frequent saves for unlimited mode
            if (extractionCount % 20 === 0) {
              await this.saveSession();
              logger.info(`  💾 Periodic save completed (Memory: ${this.extractedAds.length}, DB: ${this.totalDbAds})`);
            }

            // MEMORY MANAGEMENT WITHOUT DATA DELETION
            if (heapMB > 350 || totalMB > 450) { // Memory warning thresholds
              logger.warn(`⚠️ High memory usage detected: ${heapMB}MB heap, ${totalMB}MB total`);
              logger.info(`📊 Current data: ${this.extractedAds.length} ads in memory, ${this.totalDbAds} in database`);

              // Save current state to ensure no data loss
              await this.saveSession();
              logger.info(`💾 All data preserved in session and database`);

              // Only garbage collection - NO DATA DELETION
              if (global.gc) {
                global.gc();
                logger.info(`🗑️ Garbage collection performed - data preserved`);
              }

              // Force browser restart if memory is critically high
              if (heapMB > 400 || totalMB > 500) {
                logger.warn(`🚨 Critical memory usage - forcing safe browser restart`);
                try {
                  await this.restartBrowser();
                  logger.info(`✅ Browser restarted - all data preserved`);
                } catch (error) {
                  logger.error(`Browser restart failed: ${error.message}`);
                }
              }
            }

            // SAFE PERIODIC BROWSER RESTART for memory cleanup
            const browserUptime = Date.now() - this.lastBrowserRestart;
            const restartInterval = 45 * 60 * 1000; // Restart every 45 minutes (less aggressive)

            // Only restart if memory is getting high AND enough time has passed
            const shouldRestart = browserUptime > restartInterval && (heapMB > 300 || totalMB > 400);

            if (shouldRestart) {
              logger.info(`🔄 Safe browser restart scheduled (${Math.round(browserUptime/60000)} min uptime, ${heapMB}MB memory)`);

              try {
                // Save current progress before restart
                logger.info(`💾 Saving progress before browser restart...`);
                await this.saveSession();

                // Only restart between extraction cycles to minimize disruption
                logger.info(`🔄 Performing safe browser restart...`);
                await this.restartBrowser();

                logger.info(`✅ Browser safely restarted - extraction continuing seamlessly`);
              } catch (restartError) {
                logger.error(`Browser restart failed: ${restartError.message}`);
                logger.info(`📋 Continuing with existing browser to avoid disruption`);
                // Reset restart timer to avoid immediate retry
                this.lastBrowserRestart = Date.now();
              }
            }

            // SEENADS CACHE OPTIMIZATION (without deleting extracted ads)
            if (this.seenAds.size > 8000) { // Higher threshold for cache management
              logger.info(`📋 seenAds cache optimization: ${this.seenAds.size} entries (preserving all data)`);

              // Only reduce seenAds cache for memory, but keep all extracted ads
              // Rebuild seenAds from recent ads for duplicate detection efficiency
              const recentAds = this.extractedAds.slice(-2000); // Use more recent ads for better detection
              this.seenAds.clear();

              recentAds.forEach(ad => {
                const key = `${ad.headline}_${ad.body}_${ad.image}_${ad.advertiser}`;
                this.seenAds.add(key);
              });

              logger.info(`  ✅ seenAds cache optimized: ${this.seenAds.size} entries (all ${this.extractedAds.length} ads preserved)`);
            }
          }
        }

        // Periodic scrolling status
        if (extractionCount % 3 === 0) {
          logger.info(`📜 Auto-scrolling...`);
        }

        // Small delay between extraction cycles
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Final save
      await this.saveSession();

      parentPort.postMessage({
        type: 'status_update',
        data: { status: 'completed', progress: 100 }
      });

      logger.info(`\n✅ Extraction complete!`);
      logger.info(`📊 Total ads: ${this.extractedAds.length}`);
      logger.info(`📁 Saved to: ${path.basename(this.sessionFile)}`);

    } catch (error) {
      logger.error(`❌ Extraction failed: ${error.message}`);

      parentPort.postMessage({
        type: 'error',
        data: { message: error.message }
      });
    } finally {
      await this.cleanup();
    }
  }

  async stop() {
    this.isRunning = false;
    logger.info('🛑 Stopping extraction...');

    // Save any remaining ads
    if (this.extractedAds.length > 0) {
      await this.saveSession();
    }

    // Cleanup browser resources
    await this.cleanup();

    logger.info('✅ Extraction stopped successfully');
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      logger.warn(`Cleanup error: ${error.message}`);
    }
  }
}

// Handle messages from parent including termination signal
parentPort.on('message', async (message) => {
  if (message.type === 'stop') {
    logger.info('🛑 Stop signal received - initiating shutdown...');
    if (global.extractor) {
      await global.extractor.stop();
    }
    // Exit the worker thread after cleanup
    logger.info('✅ Extraction stopped gracefully');
    process.exit(0);
  }
});

// Handle termination signal from parent
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received - emergency shutdown...');
  if (global.extractor) {
    await global.extractor.stop();
  }
  process.exit(0);
});

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught exception:', error.message);
  logger.error(error.stack);

  // Try to save data before exiting
  if (global.extractor && global.extractor.extractedAds.length > 0) {
    global.extractor.saveSession().catch(() => {
      logger.error('Failed to save on crash');
    }).finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejections - just log them
});

// Start extraction
async function startExtraction() {
  try {
    global.extractor = new WorkerAdExtractor();
    await global.extractor.run();
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      data: { message: `Worker failed: ${error.message}` }
    });
  }
}

startExtraction();