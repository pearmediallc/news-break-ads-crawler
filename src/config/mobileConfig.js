// Mobile Configuration for News Break Ads Crawler v1.2
const mobileConfig = {
  // Popular mobile user agents for different devices
  userAgents: {
    iphone14: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    iphone13: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    androidPixel: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    ipadPro: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    androidTablet: 'Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
  },

  // Device viewport dimensions
  viewports: {
    iphone14: { width: 390, height: 844, deviceScaleFactor: 3 },
    iphone13: { width: 390, height: 844, deviceScaleFactor: 3 },
    iphone12: { width: 375, height: 812, deviceScaleFactor: 3 },
    iphoneSE: { width: 375, height: 667, deviceScaleFactor: 2 },
    androidPixel: { width: 412, height: 915, deviceScaleFactor: 2.625 },
    androidSamsung: { width: 360, height: 800, deviceScaleFactor: 3 },
    ipadPro: { width: 834, height: 1194, deviceScaleFactor: 2 },
    ipadMini: { width: 768, height: 1024, deviceScaleFactor: 2 },
    androidTablet: { width: 800, height: 1280, deviceScaleFactor: 2 }
  },

  // Mobile-specific ad selectors for News Break
  mobileAdSelectors: {
    // Mobile banner ads
    banner: [
      '[data-ad-format="mobile-banner"]',
      '.mobile-banner-ad',
      '.ad-mobile-banner',
      '[class*="mobile_ad_banner"]',
      '.nb-mobile-banner'
    ],

    // Interstitial ads (full screen)
    interstitial: [
      '.mobile-interstitial-ad',
      '.fullscreen-ad-mobile',
      '[data-ad-type="interstitial"]',
      '.nb-interstitial-mobile'
    ],

    // Native in-feed ads
    native: [
      '.feed-ad-mobile',
      '.native-ad-mobile',
      '[data-nb-mobile-ad="native"]',
      '.nb-feed-item[data-promoted="true"]',
      '.mobile-sponsored-content'
    ],

    // Sticky ads (bottom/top)
    sticky: [
      '.sticky-ad-mobile',
      '.mobile-sticky-bottom',
      '.mobile-sticky-top',
      '[data-mobile-sticky="true"]',
      '.nb-sticky-mobile'
    ],

    // In-article ads
    inArticle: [
      '.in-article-ad-mobile',
      '.mobile-article-ad',
      '.content-ad-mobile',
      '[data-mobile-placement="in-article"]',
      '.nb-article-ad-mobile'
    ],

    // Video ads
    video: [
      '.mobile-video-ad',
      '.video-ad-container-mobile',
      '[data-mobile-video-ad="true"]',
      '.nb-video-mobile-ad'
    ]
  },

  // Mobile ad dimensions to detect
  adDimensions: {
    mobileBanner: { width: 320, height: 50 },
    largeMobileBanner: { width: 320, height: 100 },
    mediumRectangle: { width: 300, height: 250 },
    interstitial: { width: 'full', height: 'full' },
    mobileLeaderboard: { width: 320, height: 50 },
    mobileInline: { width: 300, height: 250 }
  },

  // Mobile-specific ad networks
  mobileAdNetworks: [
    'googlesyndication.com/pagead/js/adsbygoogle.js',
    'amazon-adsystem.com/aax2/apstag.js',
    'facebook.com/tr',
    'doubleclick.net',
    'adsafeprotected.com',
    'moatads.com',
    'outbrain.com',
    'taboola.com',
    'branch.io',
    'appsflyer.com',
    'adjust.com'
  ],

  // Touch event attributes to look for
  touchAttributes: [
    'ontouchstart',
    'ontouchend',
    'data-touch',
    'data-swipe',
    'data-tap'
  ],

  // Mobile-specific metadata
  mobileMetaTags: [
    'viewport',
    'mobile-web-app-capable',
    'apple-mobile-web-app-capable',
    'apple-mobile-web-app-status-bar-style',
    'format-detection'
  ]
};

// Helper functions for mobile detection
const mobileHelpers = {
  // Get random mobile user agent
  getRandomUserAgent(deviceType = 'phone') {
    const phoneAgents = ['iphone14', 'iphone13', 'androidPixel', 'androidSamsung'];
    const tabletAgents = ['ipadPro', 'androidTablet'];

    const agents = deviceType === 'tablet' ? tabletAgents : phoneAgents;
    const randomKey = agents[Math.floor(Math.random() * agents.length)];

    return {
      userAgent: mobileConfig.userAgents[randomKey],
      viewport: mobileConfig.viewports[randomKey],
      device: randomKey
    };
  },

  // Get specific device configuration
  getDeviceConfig(deviceName) {
    return {
      userAgent: mobileConfig.userAgents[deviceName] || mobileConfig.userAgents.iphone14,
      viewport: mobileConfig.viewports[deviceName] || mobileConfig.viewports.iphone14,
      device: deviceName
    };
  },

  // Combine all mobile selectors
  getAllMobileSelectors() {
    const allSelectors = [];
    Object.values(mobileConfig.mobileAdSelectors).forEach(selectorArray => {
      allSelectors.push(...selectorArray);
    });
    return [...new Set(allSelectors)]; // Remove duplicates
  },

  // Check if URL is from mobile ad network
  isMobileAdNetwork(url) {
    return mobileConfig.mobileAdNetworks.some(network => url.includes(network));
  }
};

module.exports = {
  mobileConfig,
  mobileHelpers
};