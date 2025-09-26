// Mobile Ad Extractor for News Break v1.4
const { mobileConfig, mobileHelpers } = require('../config/mobileConfig');
const logger = require('../utils/logger');

class MobileAdExtractor {
  constructor(page, deviceMode = 'mobile') {
    this.page = page;
    this.deviceMode = deviceMode;
    this.extractedAds = [];
    this.seenAds = new Set();
    this.currentDevice = null;
  }

  async setupMobileEnvironment(deviceType = 'mobile') {
    try {
      // Get device configuration
      const deviceConfig = deviceType === 'specific'
        ? mobileHelpers.getDeviceConfig('iphone14')
        : mobileHelpers.getRandomUserAgent(deviceType === 'tablet' ? 'tablet' : 'phone');

      this.currentDevice = deviceConfig.device;

      // Set user agent
      await this.page.setUserAgent(deviceConfig.userAgent);

      // Set viewport
      await this.page.setViewport({
        width: deviceConfig.viewport.width,
        height: deviceConfig.viewport.height,
        deviceScaleFactor: deviceConfig.viewport.deviceScaleFactor || 2,
        isMobile: true,
        hasTouch: true,
        isLandscape: false
      });

      // Enable touch
      await this.page.evaluateOnNewDocument(() => {
        // Make touch events available
        window.ontouchstart = true;
        window.ontouchmove = true;
        window.ontouchend = true;
      });

      logger.info(`📱 Mobile environment set: ${this.currentDevice}`);
      logger.info(`   User Agent: ${deviceConfig.userAgent.substring(0, 50)}...`);
      logger.info(`   Viewport: ${deviceConfig.viewport.width}x${deviceConfig.viewport.height}`);

      return true;
    } catch (error) {
      logger.error('Failed to setup mobile environment:', error);
      return false;
    }
  }

  async extractMobileAds() {
    const pageInfo = await this.page.evaluate((selectors) => {
      const foundAds = [];
      const debug = {
        totalAdsFound: 0,
        bannerAds: 0,
        nativeAds: 0,
        stickyAds: 0,
        videoAds: 0,
        interstitialAds: 0
      };

      // Helper to check if element is visible
      const isVisible = (elem) => {
        const rect = elem.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      // Extract different types of mobile ads
      Object.entries(selectors).forEach(([adType, selectorList]) => {
        selectorList.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
              if (!isVisible(element)) return;

              const adData = {
                id: `mobile_ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                deviceType: 'mobile',
                adType: adType,
                selector: selector
              };

              // Get ad content
              const headline = element.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="headline"]');
              if (headline) {
                adData.headline = headline.textContent.trim();
              }

              // Get body text
              const body = element.querySelector('p, [class*="description"], [class*="body"], [class*="text"]');
              if (body) {
                adData.body = body.textContent.trim().substring(0, 200);
              }

              // Get advertiser
              const advertiser = element.querySelector('[class*="advertiser"], [class*="sponsor"], [class*="promoted"], [class*="source"]');
              if (advertiser) {
                adData.advertiser = advertiser.textContent.trim();
              }

              // Get image
              const img = element.querySelector('img');
              if (img) {
                adData.imageUrl = img.src || img.getAttribute('data-src');
                adData.imageAlt = img.alt;
              }

              // Get link
              const link = element.querySelector('a[href]');
              if (link) {
                adData.targetUrl = link.href;
                adData.linkText = link.textContent.trim();
              }

              // Get dimensions
              const rect = element.getBoundingClientRect();
              adData.dimensions = {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                top: Math.round(rect.top),
                left: Math.round(rect.left)
              };

              // Check for video
              const video = element.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
              if (video) {
                adData.hasVideo = true;
                adData.videoSrc = video.src || video.getAttribute('src');
              }

              // Get any data attributes
              const dataAttrs = {};
              for (let attr of element.attributes) {
                if (attr.name.startsWith('data-')) {
                  dataAttrs[attr.name] = attr.value;
                }
              }
              if (Object.keys(dataAttrs).length > 0) {
                adData.dataAttributes = dataAttrs;
              }

              // Detect if it's a sticky ad
              const computedStyle = window.getComputedStyle(element);
              if (computedStyle.position === 'fixed' || computedStyle.position === 'sticky') {
                adData.isSticky = true;
                adData.stickyPosition = computedStyle.position;
              }

              // Add to found ads if has content
              if (adData.headline || adData.body || adData.imageUrl || adData.advertiser) {
                foundAds.push(adData);
                debug.totalAdsFound++;
                debug[adType + 'Ads']++;
              }
            });
          } catch (e) {
            console.error(`Error with selector ${selector}:`, e);
          }
        });
      });

      // Also check for iframes that might be ads
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        if (!isVisible(iframe)) return;

        const src = iframe.src || '';
        const id = iframe.id || '';
        const className = iframe.className || '';

        // Check if likely an ad iframe
        if (src.includes('doubleclick') || src.includes('googlesyndication') ||
            src.includes('facebook') || src.includes('amazon-adsystem') ||
            id.includes('ad') || className.includes('ad')) {

          const rect = iframe.getBoundingClientRect();
          foundAds.push({
            id: `mobile_iframe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            deviceType: 'mobile',
            adType: 'iframe',
            iframeSrc: src,
            iframeId: id,
            dimensions: {
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
          debug.totalAdsFound++;
        }
      });

      return { ads: foundAds, debug };
    }, mobileConfig.mobileAdSelectors);

    // Log stats
    logger.info(`📊 Mobile Ads Found:`);
    logger.info(`   Total: ${pageInfo.debug.totalAdsFound}`);
    logger.info(`   Banner: ${pageInfo.debug.bannerAds}`);
    logger.info(`   Native: ${pageInfo.debug.nativeAds}`);
    logger.info(`   Sticky: ${pageInfo.debug.stickyAds}`);
    logger.info(`   Video: ${pageInfo.debug.videoAds}`);

    // Filter for new ads
    const newAds = [];
    for (const ad of pageInfo.ads) {
      const key = `${ad.advertiser || ''}_${ad.headline || ''}_${ad.targetUrl || ''}_${ad.adType}`;
      if (!this.seenAds.has(key)) {
        this.seenAds.add(key);
        ad.device = this.currentDevice; // Add device info
        newAds.push(ad);
      }
    }

    return newAds;
  }

  async scrollMobilePage() {
    // Mobile-specific scrolling behavior
    await this.page.evaluate(() => {
      // Simulate touch scroll
      const scrollAmount = window.innerHeight * 0.7; // Scroll 70% of viewport

      window.scrollBy({
        top: scrollAmount,
        left: 0,
        behavior: 'smooth'
      });

      // Trigger any lazy loading
      const event = new Event('scroll');
      window.dispatchEvent(event);
    });

    // Wait for content to load
    await this.page.waitForTimeout(2000);
  }

  async simulateMobileInteractions() {
    // Simulate mobile-specific interactions
    await this.page.evaluate(() => {
      // Simulate touch events
      const elements = document.querySelectorAll('a, button, [onclick]');
      elements.forEach(el => {
        const touchEvent = new TouchEvent('touchstart', {
          touches: [new Touch({
            identifier: Date.now(),
            target: el,
            clientX: 0,
            clientY: 0
          })]
        });
        el.dispatchEvent(touchEvent);
      });
    });
  }

  async detectAndCloseMobilePopups() {
    // Close common mobile popups/overlays
    const popupSelectors = [
      '.mobile-popup-close',
      '.interstitial-close',
      '[class*="close-button"]',
      '[class*="dismiss"]',
      '.modal-close',
      '.overlay-close'
    ];

    for (const selector of popupSelectors) {
      try {
        const closeButton = await this.page.$(selector);
        if (closeButton) {
          await closeButton.click();
          logger.info('Closed mobile popup/overlay');
          await this.page.waitForTimeout(1000);
        }
      } catch (e) {
        // Ignore if selector not found
      }
    }
  }

  async extractWithRotation(rotationInterval = 5) {
    // Rotate between different device types during extraction
    const devices = ['iphone14', 'androidPixel', 'ipadPro'];
    let deviceIndex = 0;
    let scanCount = 0;

    const rotateDevice = async () => {
      const device = devices[deviceIndex % devices.length];
      const config = mobileHelpers.getDeviceConfig(device);

      await this.page.setUserAgent(config.userAgent);
      await this.page.setViewport({
        ...config.viewport,
        isMobile: true,
        hasTouch: true
      });

      logger.info(`🔄 Rotated to device: ${device}`);
      deviceIndex++;
    };

    // Initial setup
    await rotateDevice();

    // Extract with rotation
    setInterval(async () => {
      scanCount++;
      if (scanCount % rotationInterval === 0) {
        await rotateDevice();
        // Reload page with new device
        await this.page.reload({ waitUntil: 'networkidle2' });
      }
    }, 60000); // Check every minute
  }
}

module.exports = MobileAdExtractor;