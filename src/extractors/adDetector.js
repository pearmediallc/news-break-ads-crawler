// src/extractors/adDetector.js
const logger = require('../utils/logger');

class AdDetector {
  constructor() {
    this.adSelectors = [
      // Standard ad selectors
      '[data-ad]', '[data-ads]', '[data-ad-type]', '[data-ad-slot]',
      '.sponsored-content', '.native-ad', '.advertisement', '.ad-container',
      '.banner-ad', '.display-ad', '.feed-ad', '.inline-ad',
      
      // NewsBreak specific
      '[data-testid*="ad"]', '[data-testid*="sponsor"]',
      '[class*="nb-ad"]', '[class*="newsbreak-ad"]', '[id*="nb-ad"]',
      
      // NewsBreak ad types (based on user input)
      '[class*="in-feed"]', '[class*="infeed"]', '.in-feed-ad',
      '[class*="in-article"]', '[class*="inarticle"]', '.in-article-ad',
      '[class*="related-ads"]', '.related-ads',
      '[class*="end-of-article"]', '.end-of-article-ad',
      '[class*="immersive"]', '[class*="immersive-flow"]', '.immersive-flow',
      
      // Sponsored/Paid content selectors
      '[class*="sponsored"]', '[class*="promo"]', '[class*="promotion"]',
      '[class*="paid"]', '[data-sponsored]', '[data-promoted]',
      '.promoted-content', '.paid-content', '.sponsor-post',
      
      // Generic patterns
      '[id*="ad"]', '[id*="sponsor"]', '[id*="banner"]',
      
      // Third-party networks
      'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
      '[class*="adsbygoogle"]', '[id*="google_ads"]',
      
      // NewsBreak feed items that might be sponsored
      'article[data-promoted="true"]', 'div[data-sponsored="true"]',
      '[class*="feed-item"][class*="sponsored"]',
      '[class*="story-card"][class*="promoted"]',
      
      // NewsBreak specific ad indicators (based on keywords)
      '[class*="publisher"]', '[class*="partner-publisher"]',
      '[data-publisher]', '[data-partner]',
      
      // Look for "Ad" label specifically
      'span:contains("Ad")', 'div:contains("Ad")',
      '.ad-label', '.ad-badge', '[class*="ad-label"]',
      '[aria-label*="advertisement"]', '[aria-label*="ad"]',
      'div[class*="sponsored"]', 'span[class*="sponsored"]'
    ];

    this.sponsoredIndicators = [
      'sponsored', 'paid', 'promoted', 'advertisement', 'ad', 
      'sponsor', 'promo', 'promotion', 'branded content',
      'partner content', 'marketing', 'commercial', 'learn more',
      'shop now', 'online shopping tools',
      // NewsBreak specific keywords
      'AD', 'website', 'publisher', 'sponsors', 'sponsers',
      'partner publisher', 'partner-publisher',
      // Previous NewsBreak specific
      'in-feed', 'infeed', 'in-article', 'inarticle',
      'related ads', 'end of article', 'immersive flow',
      'immersive', 'recommended for you', 'suggested'
    ];
  }

  async detectAds(page) {
    try {
      logger.debug('Detecting ads on current page...');
      
      const ads = await page.evaluate(({ selectors, sponsoredIndicators }) => {
        const foundAds = [];
        
        selectors.forEach((selector, selectorIndex) => {
          try {
            const elements = document.querySelectorAll(selector);
            
            elements.forEach((element, elementIndex) => {
              const rect = element.getBoundingClientRect();
              
              // Only include visible ads
              if (rect.height > 10 && rect.width > 10 && 
                  rect.top >= -100 && rect.top <= window.innerHeight + 100) {
                
                // Check if this is a sponsored/paid ad
                const isSponsored = this.isSponsoredContent(element, sponsoredIndicators);
                const clickableElement = this.findClickableElement(element);
                
                // Check if ad contains target keywords for auto-click
                const targetKeywords = ['AD', 'website', 'publisher', 'sponsors', 'sponsers', 'partner publisher'];
                const adText = (element.textContent || '').toLowerCase();
                const hasTargetKeyword = targetKeywords.some(keyword => 
                  adText.includes(keyword.toLowerCase())
                );
                
                const adData = {
                  id: `ad_${selectorIndex}_${elementIndex}_${Date.now()}`,
                  type: this.determineAdType(element, selector),
                  selector: selector,
                  html: element.outerHTML.substring(0, 3000),
                  text: element.textContent ? element.textContent.trim().substring(0, 500) : '',
                  position: {
                    top: Math.round(rect.top + window.scrollY),
                    left: Math.round(rect.left),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    viewportTop: Math.round(rect.top),
                    scrollY: window.scrollY
                  },
                  attributes: this.extractAttributes(element),
                  links: this.extractLinks(element),
                  images: this.extractImages(element),
                  isSponsored: isSponsored,
                  clickable: !!clickableElement,
                  clickableSelector: clickableElement ? this.generateSelector(clickableElement) : null,
                  sponsoredIndicators: this.getSponsoredIndicators(element, sponsoredIndicators),
                  visible: true,
                  timestamp: Date.now(),
                  // Flag for auto-click based on keywords
                  shouldAutoClick: hasTargetKeyword,
                  detectedKeywords: targetKeywords.filter(keyword => 
                    adText.includes(keyword.toLowerCase())
                  )
                };
                
                foundAds.push(adData);
              }
            });
          } catch (e) {
            console.warn(`Error with selector ${selector}:`, e.message);
          }
        });

        return foundAds;
      }, { selectors: this.adSelectors, sponsoredIndicators: this.sponsoredIndicators });

      logger.info(`Detected ${ads.length} ads`);
      return ads;
      
    } catch (error) {
      logger.error('Ad detection failed:', error);
      return [];
    }
  }

  // Helper functions to be injected into page context
  static getHelperFunctions() {
    return `
      function determineAdType(element, selector) {
        if (element.tagName === 'IFRAME') return 'iframe';
        if (element.querySelector('video')) return 'video';
        if (selector.includes('native') || selector.includes('sponsored')) return 'native';
        if (selector.includes('banner') || selector.includes('display')) return 'display';
        return 'native';
      }

      function extractAttributes(element) {
        const attrs = {};
        for (let attr of element.attributes || []) {
          if (attr.name.startsWith('data-') || 
              attr.name.includes('ad') || 
              attr.name.includes('sponsor') ||
              ['class', 'id', 'src', 'href'].includes(attr.name)) {
            attrs[attr.name] = attr.value;
          }
        }
        return attrs;
      }

      function extractLinks(element) {
        const links = [];
        const anchors = element.querySelectorAll('a[href]');
        anchors.forEach(a => {
          if (a.href && !a.href.startsWith('javascript:') && !a.href.startsWith('#')) {
            links.push({
              href: a.href,
              text: a.textContent.trim().substring(0, 100),
              target: a.target
            });
          }
        });
        return links.slice(0, 5);
      }

      function extractImages(element) {
        const images = [];
        const imgs = element.querySelectorAll('img[src]');
        imgs.forEach(img => {
          if (img.src && !img.src.startsWith('data:')) {
            images.push({
              src: img.src,
              alt: img.alt || '',
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height
            });
          }
        });
        return images.slice(0, 3);
      }

      function isSponsoredContent(element, sponsoredIndicators) {
        const text = element.textContent.toLowerCase();
        const className = (element.className || '').toLowerCase();
        const id = (element.id || '').toLowerCase();
        const dataAttrs = Object.keys(element.dataset || {}).join(' ').toLowerCase();
        
        const allText = text + ' ' + className + ' ' + id + ' ' + dataAttrs;
        
        return sponsoredIndicators.some(indicator => 
          allText.includes(indicator.toLowerCase())
        );
      }

      function findClickableElement(element) {
        // Check if element itself is clickable
        if (element.tagName === 'A' && element.href) {
          return element;
        }
        
        // Look for clickable children
        const clickables = element.querySelectorAll('a[href], button, [onclick], [role="button"]');
        if (clickables.length > 0) {
          return clickables[0];
        }
        
        // Check parent elements for clickability
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
          if (parent.tagName === 'A' && parent.href) {
            return parent;
          }
          if (parent.onclick || parent.getAttribute('role') === 'button') {
            return parent;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        return null;
      }

      function generateSelector(element) {
        if (element.id) {
          return '#' + element.id;
        }
        
        let selector = element.tagName.toLowerCase();
        if (element.className) {
          selector += '.' + element.className.split(' ').filter(c => c).join('.');
        }
        
        return selector;
      }

      function getSponsoredIndicators(element, sponsoredIndicators) {
        const text = element.textContent.toLowerCase();
        const className = (element.className || '').toLowerCase();
        const allText = text + ' ' + className;
        
        return sponsoredIndicators.filter(indicator => 
          allText.includes(indicator.toLowerCase())
        );
      }
    `;
  }
}

module.exports = AdDetector;