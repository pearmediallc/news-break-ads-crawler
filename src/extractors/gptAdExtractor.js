// src/extractors/gptAdExtractor.js
// Google Publisher Tag (GPT) / DoubleClick Ad Extractor
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class GPTAdExtractor {
  constructor() {
    this.detectedAds = [];
    this.adSlots = new Map();
  }

  /**
   * Wait for GPT (Google Publisher Tags) to load on the page
   */
  async waitForGPTAds(page, timeout = 15000) {
    logger.info('⏳ Waiting for Google Publisher Tag ads to load...');

    try {
      // Wait for GPT library to load
      await page.waitForFunction(
        () => window.googletag && window.googletag.pubads,
        { timeout: timeout }
      );

      logger.info('✅ Google Publisher Tag detected');

      // Wait a bit more for ads to render
      await page.waitForTimeout(3000);

      // Get GPT ad slot information
      const gptInfo = await page.evaluate(() => {
        const info = {
          loaded: false,
          slots: [],
          version: null,
          adRequests: []
        };

        if (window.googletag && window.googletag.pubads) {
          info.loaded = true;
          info.version = window.googletag.getVersion ? window.googletag.getVersion() : 'unknown';

          // Get all defined ad slots
          const slots = window.googletag.pubads().getSlots();
          slots.forEach(slot => {
            const slotInfo = {
              id: slot.getSlotElementId(),
              adUnitPath: slot.getAdUnitPath(),
              sizes: slot.getSizes().map(size =>
                typeof size === 'object' ? [size.getWidth(), size.getHeight()] : size
              ),
              targeting: {},
              divId: slot.getSlotElementId(),
              isDisplayed: false
            };

            // Get targeting parameters
            const targetingKeys = slot.getTargetingKeys();
            targetingKeys.forEach(key => {
              slotInfo.targeting[key] = slot.getTargeting(key);
            });

            // Check if the slot div exists and has content
            const slotDiv = document.getElementById(slotInfo.id);
            if (slotDiv) {
              slotInfo.isDisplayed = slotDiv.innerHTML.length > 0;
              slotInfo.hasIframe = !!slotDiv.querySelector('iframe');
            }

            info.slots.push(slotInfo);
          });
        }

        // Also check for any DoubleClick iframes
        const doubleClickIframes = document.querySelectorAll('iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"]');
        info.doubleClickIframeCount = doubleClickIframes.length;

        return info;
      });

      logger.info(`📊 GPT Info: Version ${gptInfo.version}, ${gptInfo.slots.length} ad slots defined`);

      if (gptInfo.doubleClickIframeCount > 0) {
        logger.info(`🎯 Found ${gptInfo.doubleClickIframeCount} DoubleClick iframes`);
      }

      return gptInfo;

    } catch (error) {
      logger.warn(`GPT not detected within ${timeout}ms: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract all Google ads from the page
   */
  async extractGoogleAds(page) {
    logger.info('🔍 Extracting Google/DoubleClick ads...');

    const ads = await page.evaluate(() => {
      const extractedAds = [];

      // Method 1: Find all Google Ad iframes
      const googleAdIframes = document.querySelectorAll([
        'iframe[id^="google_ads_iframe"]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="safeframe.googlesyndication.com"]',
        'iframe[name^="google_ads_iframe"]'
      ].join(', '));

      googleAdIframes.forEach((iframe, index) => {
        const rect = iframe.getBoundingClientRect();

        // Skip invisible iframes
        if (rect.width === 0 || rect.height === 0) return;

        const adData = {
          id: `gpt_iframe_${Date.now()}_${index}`,
          type: 'iframe',
          source: 'Google Ads',
          iframe: {
            id: iframe.id,
            name: iframe.name,
            src: iframe.src,
            width: rect.width,
            height: rect.height
          },
          position: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            visible: rect.top < window.innerHeight && rect.bottom > 0
          },
          container: null
        };

        // Find the container div
        const container = iframe.closest('[id*="google_ads"], [id*="div-gpt-ad"], [class*="ad-slot"]') || iframe.parentElement;
        if (container) {
          adData.container = {
            id: container.id,
            className: container.className,
            dataAdSlot: container.getAttribute('data-ad-slot'),
            dataAdUnit: container.getAttribute('data-ad-unit')
          };
        }

        extractedAds.push(adData);
      });

      // Method 2: Find divs that contain Google ads
      const googleAdDivs = document.querySelectorAll([
        'div[id^="google_ads_div"]',
        'div[id*="div-gpt-ad"]',
        'ins.adsbygoogle',
        'div[data-google-query-id]'
      ].join(', '));

      googleAdDivs.forEach((div, index) => {
        const rect = div.getBoundingClientRect();

        // Skip if already processed as iframe container
        if (extractedAds.some(ad => ad.container && ad.container.id === div.id)) return;

        // Skip invisible elements
        if (rect.width === 0 || rect.height === 0) return;

        const iframe = div.querySelector('iframe');
        const adData = {
          id: `gpt_div_${Date.now()}_${index}`,
          type: 'div',
          source: 'Google Ads',
          divInfo: {
            id: div.id,
            className: div.className,
            dataAdSlot: div.getAttribute('data-ad-slot'),
            dataGoogleQueryId: div.getAttribute('data-google-query-id'),
            hasIframe: !!iframe
          },
          position: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            visible: rect.top < window.innerHeight && rect.bottom > 0
          }
        };

        if (iframe) {
          adData.iframe = {
            id: iframe.id,
            src: iframe.src,
            width: iframe.width,
            height: iframe.height
          };
        }

        extractedAds.push(adData);
      });

      // Method 3: Look for AdSense ads
      const adSenseElements = document.querySelectorAll('ins.adsbygoogle');
      adSenseElements.forEach((ins, index) => {
        const rect = ins.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        extractedAds.push({
          id: `adsense_${Date.now()}_${index}`,
          type: 'adsense',
          source: 'Google AdSense',
          position: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            visible: rect.top < window.innerHeight && rect.bottom > 0
          },
          attributes: {
            dataAdClient: ins.getAttribute('data-ad-client'),
            dataAdSlot: ins.getAttribute('data-ad-slot'),
            dataAdFormat: ins.getAttribute('data-ad-format'),
            dataFullWidthResponsive: ins.getAttribute('data-full-width-responsive')
          }
        });
      });

      return extractedAds;
    });

    logger.info(`✅ Extracted ${ads.length} Google ads`);

    // Log summary
    const adTypes = {};
    ads.forEach(ad => {
      adTypes[ad.type] = (adTypes[ad.type] || 0) + 1;
    });

    Object.entries(adTypes).forEach(([type, count]) => {
      logger.info(`   ${type}: ${count} ads`);
    });

    this.detectedAds = ads;
    return ads;
  }

  /**
   * Monitor ad loading in real-time
   */
  async monitorAdLoading(page, duration = 30000) {
    logger.info(`📡 Monitoring ad loading for ${duration/1000} seconds...`);

    // Inject ad monitoring script (skip if not supported)
    try {
      if (page.evaluateOnNewDocument) {
        await page.evaluateOnNewDocument(() => {
      window.__adMonitor = {
        adRequests: [],
        adResponses: [],
        adSlots: []
      };

      // Monitor GPT events if available
      if (window.googletag && window.googletag.cmd) {
        window.googletag.cmd.push(() => {
          // Listen for slot render events
          window.googletag.pubads().addEventListener('slotRenderEnded', (event) => {
            window.__adMonitor.adSlots.push({
              timestamp: Date.now(),
              slot: event.slot.getSlotElementId(),
              size: event.size,
              isEmpty: event.isEmpty,
              advertiserId: event.advertiserId,
              campaignId: event.campaignId,
              creativeId: event.creativeId,
              lineItemId: event.lineItemId
            });
            console.log('Ad Rendered:', event.slot.getSlotElementId(), event.size);
          });

          // Listen for impression viewable events
          window.googletag.pubads().addEventListener('impressionViewable', (event) => {
            console.log('Ad Viewable:', event.slot.getSlotElementId());
          });
        });
      }

      // Monitor network requests for ad calls
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' &&
            (url.includes('doubleclick.net') ||
             url.includes('googlesyndication.com') ||
             url.includes('googleadservices.com'))) {
          window.__adMonitor.adRequests.push({
            timestamp: Date.now(),
            url: url,
            type: 'fetch'
          });
          console.log('Ad Request:', url);
        }
        return originalFetch.apply(this, args);
      };
    });
      }
    } catch (e) {
      logger.debug('evaluateOnNewDocument not supported, skipping injection');
    }

    const startTime = Date.now();
    const checkInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(checkInterval);

        // Get monitoring results if available
        const monitoringData = await page.evaluate(() => window.__adMonitor || { adRequests: [], adSlots: [] });

        logger.info(`📊 Ad Loading Summary:`);
        logger.info(`   Ad Requests: ${monitoringData.adRequests.length}`);
        logger.info(`   Ad Slots Rendered: ${monitoringData.adSlots.length}`);

        if (monitoringData.adSlots.length > 0) {
          logger.info(`   Rendered Ads:`);
          monitoringData.adSlots.forEach(slot => {
            logger.info(`     - ${slot.slot}: ${slot.size ? `${slot.size[0]}x${slot.size[1]}` : 'no size'} ${slot.isEmpty ? '(empty)' : '(filled)'}`);
          });
        }

        return monitoringData;
      }

      // Check for new ads every 2 seconds
      const currentAds = await this.extractGoogleAds(page);
      if (currentAds.length > this.detectedAds.length) {
        logger.info(`🆕 New ads detected: ${currentAds.length - this.detectedAds.length} new`);
      }

    }, 2000);

    return new Promise(resolve => {
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(this.detectedAds);
      }, duration);
    });
  }

  /**
   * Extract advertiser information from ads
   */
  async extractAdvertiserInfo(page, ad) {
    try {
      if (ad.type === 'iframe' && ad.iframe.src) {
        // Parse iframe URL for advertiser info
        const url = new URL(ad.iframe.src);

        ad.advertiserInfo = {
          domain: url.hostname,
          queryParams: {}
        };

        // Extract useful parameters
        url.searchParams.forEach((value, key) => {
          if (['iu', 'sz', 'url', 'click', 'adurl'].includes(key.toLowerCase())) {
            ad.advertiserInfo.queryParams[key] = value;
          }
        });

        // Try to get the actual ad content
        if (ad.container && ad.container.id) {
          const adContent = await page.evaluate((containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return null;

            const info = {
              hasImage: false,
              hasText: false,
              images: [],
              text: '',
              links: []
            };

            // Look for images
            const images = container.querySelectorAll('img');
            images.forEach(img => {
              if (img.src && !img.src.includes('data:image')) {
                info.images.push({
                  src: img.src,
                  alt: img.alt,
                  width: img.width,
                  height: img.height
                });
                info.hasImage = true;
              }
            });

            // Look for text
            const textElements = container.querySelectorAll('span, p, div');
            textElements.forEach(el => {
              const text = el.textContent.trim();
              if (text && text.length > 10) {
                info.text += text + ' ';
                info.hasText = true;
              }
            });

            // Look for links
            const links = container.querySelectorAll('a[href]');
            links.forEach(link => {
              info.links.push({
                href: link.href,
                text: link.textContent.trim()
              });
            });

            return info;
          }, ad.container.id);

          if (adContent) {
            ad.content = adContent;
          }
        }
      }

      return ad;

    } catch (error) {
      logger.error(`Error extracting advertiser info: ${error.message}`);
      return ad;
    }
  }

  /**
   * Save extracted ads to file
   */
  async saveAds(ads, outputDir = './output') {
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = path.join(outputDir, `google_ads_${timestamp}.json`);

    await fs.writeFile(filename, JSON.stringify(ads, null, 2));
    logger.info(`💾 Saved ${ads.length} ads to ${filename}`);

    return filename;
  }
}

module.exports = GPTAdExtractor;