// src/extractors/adNetworkDetector.js
const logger = require('../utils/logger');

class AdNetworkDetector {
  constructor() {
    // Common ad network patterns and selectors
    this.adNetworkPatterns = {
      // Google Ads / AdSense / DoubleClick
      google: {
        iframeSelectors: [
          'iframe[src*="doubleclick.net"]',
          'iframe[src*="googlesyndication.com"]',
          'iframe[src*="googleadservices.com"]',
          'iframe[id^="google_ads_iframe"]',
          'iframe[name^="google_ads_iframe"]',
          'iframe[src*="safeframe.googlesyndication.com"]'
        ],
        divSelectors: [
          'div[id^="google_ads_div"]',
          'div[class*="google-ads"]',
          'div[data-google-query-id]',
          'ins.adsbygoogle',
          'div[id*="div-gpt-ad"]'
        ],
        scriptPatterns: [
          'pagead2.googlesyndication.com',
          'googletagmanager.com',
          'googletagservices.com'
        ]
      },

      // Amazon Ads
      amazon: {
        iframeSelectors: [
          'iframe[src*="amazon-adsystem.com"]',
          'iframe[src*="aax.amazon"]'
        ],
        divSelectors: [
          'div[id*="amzn-assoc-ad"]',
          'div[class*="amazon-ad"]'
        ]
      },

      // Facebook Ads (Audience Network)
      facebook: {
        iframeSelectors: [
          'iframe[src*="facebook.com/tr"]',
          'iframe[src*="facebook.com/plugins/ad"]'
        ],
        divSelectors: [
          'div[data-fbad]',
          'div[class*="fb-ad"]'
        ]
      },

      // Taboola
      taboola: {
        divSelectors: [
          'div[id^="taboola"]',
          'div[class*="taboola"]',
          '.taboola-container',
          'div[data-taboola]'
        ]
      },

      // Outbrain
      outbrain: {
        divSelectors: [
          'div[class*="outbrain"]',
          'div[data-widget-id*="outbrain"]',
          '.ob-widget',
          'div[data-ob]'
        ]
      },

      // Media.net
      medianet: {
        iframeSelectors: [
          'iframe[src*="media.net"]'
        ],
        divSelectors: [
          'div[id*="medianet"]',
          'div[class*="medianet"]'
        ]
      },

      // Generic ad indicators
      generic: {
        iframeSelectors: [
          'iframe[src*="serving-sys.com"]',
          'iframe[src*="adsrvr.org"]',
          'iframe[src*="adsafeprotected.com"]',
          'iframe[src*="moatads.com"]',
          'iframe[src*="scorecardresearch.com"]',
          'iframe[src*="adsystem"]',
          'iframe[src*="adserver"]',
          'iframe[src*="adtech"]',
          'iframe[src*="adzerk"]',
          'iframe[name*="ad_"]',
          'iframe[id*="ad_"]',
          'iframe[class*="ad-frame"]'
        ],
        divSelectors: [
          'div[class*="sponsored-content"]',
          'div[class*="sponsored-post"]',
          'div[data-ad-slot]',
          'div[data-ad-unit]',
          'div[id*="sponsored"]',
          'div[class*="advertisement"]',
          'div[class*="ad-container"]',
          'div[class*="ad-wrapper"]',
          'div[class*="ad-banner"]',
          'div[data-sponsored]',
          '[data-content-type="advertisement"]',
          '[data-item-type="ad"]'
        ]
      }
    };
  }

  async detectAds(page) {
    logger.info('🎯 Starting Ad Network Detection...');

    const detectedAds = await page.evaluate((patterns) => {
      const ads = [];
      const processedElements = new Set();

      // Helper function to extract ad data
      function extractAdData(element, type, network) {
        // Skip if already processed
        const elementId = element.outerHTML.substring(0, 100);
        if (processedElements.has(elementId)) return null;
        processedElements.add(elementId);

        const rect = element.getBoundingClientRect();

        // Skip invisible elements
        if (rect.width === 0 || rect.height === 0) return null;
        if (element.style.display === 'none' || element.style.visibility === 'hidden') return null;

        const adData = {
          id: `${network}_ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: type,
          network: network,
          selector: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (element.className ? `.${element.className.split(' ')[0]}` : ''),
          position: {
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          visible: rect.top < window.innerHeight && rect.bottom > 0,
          attributes: {}
        };

        // For iframes, get the source
        if (element.tagName === 'IFRAME') {
          adData.src = element.src;
          adData.attributes.name = element.name;
          adData.attributes.id = element.id;
        }

        // For divs, get relevant attributes
        if (element.tagName === 'DIV') {
          adData.attributes.id = element.id;
          adData.attributes.className = element.className;
          adData.attributes.dataAdSlot = element.getAttribute('data-ad-slot');
          adData.attributes.dataAdUnit = element.getAttribute('data-ad-unit');

          // Check for inner iframes
          const innerIframe = element.querySelector('iframe');
          if (innerIframe) {
            adData.innerIframeSrc = innerIframe.src;
          }

          // Get any visible text (might be "Sponsored" label)
          const visibleText = element.innerText ? element.innerText.substring(0, 100) : '';
          if (visibleText.toLowerCase().includes('sponsor') ||
              visibleText.toLowerCase().includes('ad') ||
              visibleText.toLowerCase().includes('promoted')) {
            adData.sponsoredText = visibleText;
          }
        }

        // Try to find associated links
        const links = element.querySelectorAll('a[href]');
        if (links.length > 0) {
          adData.links = Array.from(links).slice(0, 3).map(link => ({
            href: link.href,
            text: link.innerText.substring(0, 50)
          }));
        }

        return adData;
      }

      // Check each ad network
      Object.entries(patterns).forEach(([network, config]) => {
        // Check iframes
        if (config.iframeSelectors) {
          config.iframeSelectors.forEach(selector => {
            try {
              const iframes = document.querySelectorAll(selector);
              iframes.forEach(iframe => {
                const adData = extractAdData(iframe, 'iframe', network);
                if (adData) {
                  ads.push(adData);
                  console.log(`Found ${network} iframe ad:`, adData.src);
                }
              });
            } catch (e) {
              console.warn(`Invalid selector: ${selector}`);
            }
          });
        }

        // Check divs
        if (config.divSelectors) {
          config.divSelectors.forEach(selector => {
            try {
              const divs = document.querySelectorAll(selector);
              divs.forEach(div => {
                const adData = extractAdData(div, 'div', network);
                if (adData) {
                  ads.push(adData);
                  console.log(`Found ${network} div ad:`, adData.selector);
                }
              });
            } catch (e) {
              console.warn(`Invalid selector: ${selector}`);
            }
          });
        }
      });

      // Also look for any elements with "Advertisement" labels
      const adLabels = document.querySelectorAll('*');
      adLabels.forEach(element => {
        const text = element.innerText || '';
        if (text.trim() === 'Advertisement' ||
            text.trim() === 'Ad' ||
            text.trim() === 'Sponsored' ||
            text.trim() === 'Promoted') {
          // Look for the actual ad content near this label
          const parent = element.parentElement;
          const nextSibling = element.nextElementSibling;
          const container = parent?.querySelector('iframe, [class*="ad"], [id*="ad"]');

          if (container && !processedElements.has(container.outerHTML.substring(0, 100))) {
            const adData = extractAdData(container, container.tagName.toLowerCase(), 'labeled');
            if (adData) {
              adData.label = text.trim();
              ads.push(adData);
            }
          }
        }
      });

      return ads;
    }, this.adNetworkPatterns);

    logger.info(`🎯 Ad Network Detection found ${detectedAds.length} ads`);

    // Log summary by network
    const adsByNetwork = {};
    detectedAds.forEach(ad => {
      adsByNetwork[ad.network] = (adsByNetwork[ad.network] || 0) + 1;
    });

    Object.entries(adsByNetwork).forEach(([network, count]) => {
      logger.info(`   ${network}: ${count} ads`);
    });

    return detectedAds;
  }

  async extractAdDetails(page, ad) {
    try {
      // If it's an iframe, try to get its content
      if (ad.type === 'iframe' && ad.src) {
        logger.info(`Extracting iframe ad: ${ad.src}`);

        // Parse the iframe URL to get advertiser info
        const url = new URL(ad.src);
        ad.advertiserDomain = url.hostname;

        // Extract query parameters which often contain ad info
        ad.queryParams = {};
        url.searchParams.forEach((value, key) => {
          ad.queryParams[key] = value;
        });
      }

      // If it's a div, look for nested content
      if (ad.type === 'div') {
        const additionalData = await page.evaluate((adId, selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;

          const data = {
            images: [],
            text: '',
            links: []
          };

          // Get images
          const images = element.querySelectorAll('img');
          images.forEach(img => {
            if (img.src) {
              data.images.push({
                src: img.src,
                alt: img.alt,
                width: img.width,
                height: img.height
              });
            }
          });

          // Get text content
          data.text = element.innerText ? element.innerText.substring(0, 500) : '';

          // Get links
          const links = element.querySelectorAll('a[href]');
          links.forEach(link => {
            data.links.push({
              href: link.href,
              text: link.innerText.substring(0, 100),
              target: link.target
            });
          });

          return data;
        }, ad.id, ad.selector);

        if (additionalData) {
          ad.content = additionalData;
        }
      }

      return ad;
    } catch (error) {
      logger.error(`Error extracting ad details: ${error.message}`);
      return ad;
    }
  }

  async clickAndExtractAd(page, ad) {
    try {
      logger.info(`Attempting to click ad: ${ad.id} (${ad.network})`);

      // If it has links, try to click them
      if (ad.links && ad.links.length > 0) {
        for (const link of ad.links) {
          if (link.href && !link.href.includes('newsbreak.com')) {
            logger.info(`Found ad link: ${link.href}`);

            // Try to navigate to the ad destination
            const originalUrl = page.url();

            try {
              await page.goto(link.href, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
              });

              const newUrl = page.url();
              if (newUrl !== originalUrl) {
                logger.info(`✅ Successfully navigated to ad destination: ${newUrl}`);

                // Extract landing page info
                ad.landingPage = {
                  url: newUrl,
                  domain: new URL(newUrl).hostname,
                  title: await page.title()
                };

                // Go back
                await page.goto(originalUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: 10000
                });

                return ad;
              }
            } catch (navError) {
              logger.warn(`Could not navigate to ad link: ${navError.message}`);
            }
          }
        }
      }

      // If it's an iframe ad, we can't directly click it but we can extract the destination
      if (ad.type === 'iframe' && ad.src) {
        // Parse the iframe URL for destination info
        if (ad.queryParams) {
          ad.landingPage = {
            url: ad.queryParams.url || ad.queryParams.clickurl || ad.queryParams.destination || ad.src,
            extractedFrom: 'iframe_params'
          };
        }
      }

      return ad;
    } catch (error) {
      logger.error(`Error clicking ad ${ad.id}: ${error.message}`);
      return ad;
    }
  }
}

module.exports = AdNetworkDetector;