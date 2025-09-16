// src/extractors/smartAdDetector.js
const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

class SmartAdDetector {
  constructor() {
    this.learnedSelectors = [];
    this.adPatterns = [];
    this.selectorsFile = path.join(__dirname, '../../data/learned_selectors.json');
    this.loadLearnedSelectors();
  }

  async loadLearnedSelectors() {
    try {
      if (await fs.exists(this.selectorsFile)) {
        const data = await fs.readJson(this.selectorsFile);
        this.learnedSelectors = data.selectors || [];
        this.adPatterns = data.patterns || [];
        logger.info(`Loaded ${this.learnedSelectors.length} learned selectors`);
      }
    } catch (error) {
      logger.warn('Could not load learned selectors:', error.message);
    }
  }

  async saveLearnedSelectors() {
    try {
      await fs.writeJson(this.selectorsFile, {
        selectors: this.learnedSelectors,
        patterns: this.adPatterns,
        lastUpdated: new Date().toISOString()
      }, { spaces: 2 });
      logger.info('Saved learned selectors');
    } catch (error) {
      logger.error('Failed to save learned selectors:', error.message);
    }
  }

  async analyzePageStructure(page) {
    logger.info('🤖 Smart Ad Detection: Focusing on ForYou containers with iframes...');

    const analysis = await page.evaluate(() => {
      const data = {
        potentialAds: [],
        patterns: {
          classes: {},
          ids: {},
          attributes: {},
          textPatterns: []
        },
        elements: []
      };

      // We only care about ForYou containers with iframes now
      // No need for keyword matching
      
      // Keywords to EXCLUDE (social media footer links)
      const excludeKeywords = [
        'facebook.com/newsbreak', 'twitter.com/newsbreak',
        'instagram.com/newsbreak', 'youtube.com/newsbreak',
        'linkedin.com/newsbreak', 'pinterest.com/newsbreak',
        'follow us', 'connect with us', 'social media',
        'footer', 'navigation', 'menu', 'header',
        'about us', 'contact us', 'privacy policy', 'terms',
        'copyright', '© newsbreak'
      ];

      // Only look for ForYou containers with iframes
      const forYouContainers = document.querySelectorAll('[id^="ForYou-"]');

      forYouContainers.forEach(container => {
        const iframe = container.querySelector('iframe.mspai-nova-native');
        if (!iframe) return;

        const rect = container.getBoundingClientRect();
        
        // No need to check for footers/headers since we're only looking at ForYou containers
        
        // Try to extract from iframe content
        let adData = {
          containerId: container.id,
          iframeWidth: iframe.width,
          iframeHeight: iframe.height,
          advertiser: '',
          headline: '',
          body: '',
          image: '',
          score: 100, // High score since it's definitely an ad
          reasons: ['ForYou container with iframe']
        };

        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc && iframeDoc.body) {
            // Extract specific elements from iframe
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
          }
        } catch (e) {
          // Cross-origin iframe
          adData.advertiser = 'Protected Ad';
          adData.headline = 'Cross-origin content';
          adData.reasons.push('Cross-origin iframe - cannot access content');
        }

        // No need for complex scoring - we know it's an ad if it's in a ForYou container with iframe

        // Add the ad data to potential ads
        if (adData.advertiser || adData.headline || adData.body) {
          data.potentialAds.push(adData);
        }

        // Already handled above
      });

      // Sort by score
      data.potentialAds.sort((a, b) => b.score - a.score);
      data.elements.sort((a, b) => b.score - a.score);

      // Keep top candidates
      data.potentialAds = data.potentialAds.slice(0, 50);
      data.elements = data.elements.slice(0, 100);

      return data;
    });

    // Process the analysis
    const newSelectors = this.generateSelectorsFromAnalysis(analysis);
    
    logger.info(`🔍 Analysis complete:`);
    logger.info(`   Found ${analysis.potentialAds.length} potential ads`);
    logger.info(`   Found ${analysis.elements.length} elements with ad indicators`);
    logger.info(`   Generated ${newSelectors.length} new selectors`);

    // Learn from this analysis
    if (newSelectors.length > 0) {
      await this.learnNewSelectors(newSelectors);
    }

    return {
      analysis,
      selectors: newSelectors,
      potentialAds: analysis.potentialAds
    };
  }

  generateSelectorsFromAnalysis(analysis) {
    const selectors = new Set();

    // Generate selectors from high-frequency patterns
    Object.entries(analysis.patterns.classes).forEach(([className, count]) => {
      if (count >= 2) {
        selectors.add(`.${className}`);
      }
    });

    Object.entries(analysis.patterns.ids).forEach(([id, count]) => {
      if (count >= 1 && id) {
        selectors.add(`#${id}`);
      }
    });

    Object.entries(analysis.patterns.attributes).forEach(([attrPattern, count]) => {
      if (count >= 2) {
        const [key, value] = attrPattern.split('=');
        if (value && value !== 'undefined') {
          selectors.add(`[${key}="${value}"]`);
        } else {
          selectors.add(`[${key}]`);
        }
      }
    });

    // Generate selectors from top potential ads
    analysis.potentialAds.slice(0, 10).forEach(ad => {
      // Create specific selector for this element
      if (ad.id) {
        selectors.add(`#${ad.id}`);
      }
      
      if (ad.classes.length > 0) {
        // Use most specific class combination
        const classSelector = ad.classes
          .filter(c => c && !c.match(/^[0-9]/))
          .slice(0, 2)
          .map(c => `.${c}`)
          .join('');
        
        if (classSelector) {
          selectors.add(classSelector);
        }
      }

      // Create attribute selectors for data attributes with ad keywords
      Object.entries(ad.attributes).forEach(([key, value]) => {
        if (key.includes('ad') || key.includes('sponsor') || key.includes('promo')) {
          selectors.add(`[${key}]`);
        }
      });
    });

    return Array.from(selectors);
  }

  async learnNewSelectors(newSelectors) {
    // Add new selectors that aren't already known
    newSelectors.forEach(selector => {
      if (!this.learnedSelectors.includes(selector)) {
        this.learnedSelectors.push(selector);
        logger.debug(`Learned new selector: ${selector}`);
      }
    });

    // Save to file
    await this.saveLearnedSelectors();
  }

  async detectAds(page) {
    try {
      logger.info('🤖 Smart Ad Detection: Focusing on ForYou containers only...');

      // Analyze the page for ForYou containers
      const { selectors, potentialAds } = await this.analyzePageStructure(page);

      // We don't need complex selectors anymore
      // Just return the ForYou ads we found
      if (potentialAds.length > 0) {
        logger.info(`Found ${potentialAds.length} ForYou ads`);
        return potentialAds.map(ad => ({
          id: `smart_ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'ForYou-iframe',
          selector: `#${ad.containerId}`,
          advertiser: ad.advertiser,
          headline: ad.headline,
          text: ad.body,
          image: ad.image,
          position: ad.position || {},
          attributes: {
            containerId: ad.containerId,
            iframeWidth: ad.iframeWidth,
            iframeHeight: ad.iframeHeight
          },
          isSponsored: true,
          clickable: false,
          score: ad.score,
          timestamp: Date.now()
        }));
      }

      // If no ForYou ads found, try to find them again
      const ads = await page.evaluate(() => {
        const foundAds = [];
        const processedElements = new Set();

        // Only look for ForYou containers
        const forYouContainers = document.querySelectorAll('[id^="ForYou-"]');

        forYouContainers.forEach(container => {
          const iframe = container.querySelector('iframe.mspai-nova-native');
          if (!iframe) return;

          let adData = {
            id: `smart_ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            selector: `#${container.id}`,
            type: 'ForYou-iframe',
            containerId: container.id,
            advertiser: '',
            headline: '',
            text: '',
            image: '',
            timestamp: Date.now()
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
              adData.text = bodyEl ? bodyEl.textContent.trim() : '';

              if (imageContainer) {
                const img = imageContainer.querySelector('img');
                if (img && img.src) {
                  adData.image = img.src;
                }
              }
            }
          } catch (e) {
            adData.advertiser = 'Protected Ad';
            adData.headline = 'Cross-origin iframe';
          }

          if (adData.advertiser || adData.headline || adData.text) {
            foundAds.push(adData);
          }
        });

        // No need for complex selector logic anymore

        return foundAds;
      });

      logger.info(`🤖 Smart detection found ${ads.length} ForYou ads`);

      // No need to save selectors anymore since we only look for ForYou containers

      return ads;

    } catch (error) {
      logger.error('Smart ad detection failed:', error);
      return [];
    }
  }

  formatPotentialAdsAsAds(potentialAds) {
    return potentialAds.slice(0, 20).map(potAd => ({
      id: `potential_ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: potAd.tag === 'iframe' ? 'iframe' : 'native',
      selector: 'auto-detected',
      text: potAd.text,
      position: potAd.position,
      attributes: potAd.attributes,
      isSponsored: potAd.score >= 15,
      clickable: potAd.hasLinks,
      score: potAd.score,
      reasons: potAd.reasons,
      timestamp: Date.now()
    }));
  }

  async reset() {
    logger.info('Resetting learned selectors...');
    this.learnedSelectors = [];
    this.adPatterns = [];
    await this.saveLearnedSelectors();
  }
}

module.exports = SmartAdDetector;