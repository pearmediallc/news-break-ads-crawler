// src/crawlers/adsPowerDirectConnect.js
const { chromium } = require('playwright');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../utils/config');

class AdsPowerDirectConnect {
  constructor() {
    this.apiBase = 'http://local.adspower.net:50325';
    this.browser = null;
    this.context = null;
    this.page = null;
    this.profileData = null;
  }

  async initialize() {
    try {
      logger.info('Initializing AdsPower Direct Connection...');

      // 1. Check AdsPower status
      const isRunning = await this.checkAdsPowerStatus();
      if (!isRunning) {
        throw new Error('AdsPower is not running. Please start AdsPower application.');
      }

      // 2. Get or start a USA profile
      const profile = await this.getOrStartUSAProfile();
      if (!profile) {
        throw new Error('No USA profiles available in AdsPower');
      }

      logger.info(`Using AdsPower profile: ${profile.user_id}`);
      this.profileData = profile;

      // 3. Connect to the browser
      await this.connectToBrowser(profile);

      logger.info('✅ AdsPower Direct Connection established successfully');
      return this.page;

    } catch (error) {
      logger.error('AdsPower initialization failed:', error);
      throw error;
    }
  }

  async checkAdsPowerStatus() {
    try {
      const response = await axios.get(`${this.apiBase}/status`, { timeout: 5000 });
      logger.info('✅ AdsPower is running');
      return true;
    } catch (error) {
      logger.error('❌ AdsPower is not running');
      return false;
    }
  }

  async getOrStartUSAProfile() {
    try {
      // Get all profiles
      const profilesResponse = await axios.get(`${this.apiBase}/api/v1/user/list`, {
        params: { page: 1, page_size: 100 },
        timeout: 10000
      });

      if (profilesResponse.data.code !== 0) {
        throw new Error('Failed to get profiles');
      }

      const profiles = profilesResponse.data.data.list || [];
      
      // Find USA profiles
      const usaProfiles = profiles.filter(p => 
        p.country === 'us' || 
        p.ip_country === 'us' ||
        (p.remark && p.remark.toLowerCase().includes('us'))
      );

      if (usaProfiles.length === 0) {
        logger.error('No USA profiles found in AdsPower');
        return null;
      }

      // Try to find an already running profile
      for (const profile of usaProfiles) {
        const status = await this.checkProfileStatus(profile.user_id);
        if (status.active && status.data && status.data.ws) {
          logger.info(`Found running USA profile: ${profile.user_id}`);
          return { ...profile, connectionData: status.data };
        }
      }

      // If no running profiles, start the first USA profile
      const profileToStart = usaProfiles[0];
      logger.info(`Starting USA profile: ${profileToStart.user_id}`);
      
      const startResponse = await axios.get(`${this.apiBase}/api/v1/browser/start`, {
        params: {
          user_id: profileToStart.user_id,
          open_tabs: 1,
          new_first_tab: 1,
          headless: 0,
          disable_password_filling: 1,
          clear_cache_after_closing: 0
        },
        timeout: 30000
      });

      if (startResponse.data.code !== 0) {
        throw new Error(`Failed to start profile: ${startResponse.data.msg}`);
      }

      return { ...profileToStart, connectionData: startResponse.data.data };

    } catch (error) {
      logger.error('Failed to get/start USA profile:', error.message);
      return null;
    }
  }

  async checkProfileStatus(user_id) {
    try {
      const response = await axios.get(`${this.apiBase}/api/v1/browser/active`, {
        params: { user_id },
        timeout: 5000
      });

      return {
        active: response.data.code === 0,
        data: response.data.data
      };
    } catch (error) {
      return { active: false, data: null };
    }
  }

  async connectToBrowser(profile) {
    const connectionData = profile.connectionData;
    
    if (!connectionData) {
      throw new Error('No connection data available');
    }

    // Try different connection methods
    let connected = false;

    // Method 1: Try WebSocket connection if available
    if (connectionData.ws && connectionData.ws.selenium) {
      try {
        const wsEndpoint = connectionData.ws.selenium;
        logger.info(`Attempting WebSocket connection to: ${wsEndpoint}`);
        
        // Build proper WebSocket URL
        const wsUrl = wsEndpoint.startsWith('ws://') ? wsEndpoint : `ws://${wsEndpoint}`;
        
        this.browser = await chromium.connectOverCDP(wsUrl, {
          timeout: 10000
        });
        
        connected = true;
        logger.info('✅ Connected via WebSocket');
      } catch (error) {
        logger.warn(`WebSocket connection failed: ${error.message}`);
      }
    }

    // Method 2: Try Puppeteer connection if available
    if (!connected && connectionData.ws && connectionData.ws.puppeteer) {
      try {
        const wsEndpoint = connectionData.ws.puppeteer;
        logger.info(`Attempting Puppeteer WebSocket connection to: ${wsEndpoint}`);
        
        const wsUrl = wsEndpoint.startsWith('ws://') ? wsEndpoint : `ws://${wsEndpoint}`;
        
        this.browser = await chromium.connectOverCDP(wsUrl, {
          timeout: 10000
        });
        
        connected = true;
        logger.info('✅ Connected via Puppeteer WebSocket');
      } catch (error) {
        logger.warn(`Puppeteer connection failed: ${error.message}`);
      }
    }

    // Method 3: Try direct CDP connection
    if (!connected && connectionData.debug_port) {
      try {
        const debugPort = connectionData.debug_port;
        logger.info(`Attempting CDP connection on port: ${debugPort}`);
        
        const wsUrl = `ws://127.0.0.1:${debugPort}`;
        
        this.browser = await chromium.connectOverCDP(wsUrl, {
          timeout: 10000
        });
        
        connected = true;
        logger.info('✅ Connected via CDP');
      } catch (error) {
        logger.warn(`CDP connection failed: ${error.message}`);
      }
    }

    if (!connected) {
      throw new Error('Could not connect to AdsPower browser. Please ensure the browser is fully loaded.');
    }

    // Get context and page
    const contexts = this.browser.contexts();
    if (contexts.length > 0) {
      this.context = contexts[0];
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.page = pages[0];
      } else {
        this.page = await this.context.newPage();
      }
    } else {
      // Create new context if none exists
      this.context = await this.browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      this.page = await this.context.newPage();
    }

    // Verify USA IP
    await this.verifyUSAIP();
  }

  async checkForAdBlockers() {
    try {
      logger.info('Checking for ad blockers...');
      
      // Check if common ad blocker extensions are present
      const hasAdBlocker = await this.page.evaluate(() => {
        // Check for common ad blocker signs
        const adBlockSigns = [
          typeof window.adBlockEnabled !== 'undefined',
          typeof window.adblock !== 'undefined',
          typeof window.AdBlock !== 'undefined',
          typeof window.uBlock !== 'undefined',
          document.querySelector('#ublock-filters') !== null,
          document.querySelector('.adblock-message') !== null
        ];
        
        return adBlockSigns.some(sign => sign === true);
      });
      
      if (hasAdBlocker) {
        logger.warn('⚠️ Ad blocker detected! This may prevent sponsored ads from appearing.');
        logger.warn('Please disable ad blockers in the AdsPower profile for better ad detection.');
      } else {
        logger.info('✅ No ad blockers detected');
      }
      
      return hasAdBlocker;
    } catch (error) {
      logger.warn('Could not check for ad blockers:', error.message);
      return false;
    }
  }

  async verifyUSAIP() {
    try {
      logger.info('Verifying USA IP...');
      
      await this.page.goto('https://api.ipify.org?format=json', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
      const ipData = await this.page.evaluate(() => {
        const text = document.body.innerText;
        try {
          return JSON.parse(text);
        } catch {
          return { ip: 'Unknown' };
        }
      });
      
      const ip = ipData.ip;
      logger.info(`Current IP: ${ip}`);
      
      // Check location
      await this.page.goto(`https://ipapi.co/${ip}/json/`, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
      const locationData = await this.page.evaluate(() => {
        const text = document.body.innerText;
        try {
          return JSON.parse(text);
        } catch {
          return { country_code: 'Unknown' };
        }
      });
      
      if (locationData.country_code === 'US') {
        logger.info(`✅ USA IP confirmed! Location: ${locationData.city}, ${locationData.region}`);
      } else {
        logger.warn(`⚠️ Non-USA IP detected: ${locationData.country_name}`);
      }
      
    } catch (error) {
      logger.warn('Could not verify IP:', error.message);
    }
  }

  async navigateToNewsBreak() {
    try {
      logger.info('Navigating to NewsBreak...');
      
      // Try direct URLs to bypass location selection
      const directUrls = [
        'https://www.newsbreak.com/new-york-ny',
        'https://www.newsbreak.com/channels/new-york-ny', 
        'https://www.newsbreak.com/los-angeles-ca'
      ];
      
      let feedLoaded = false;
      
      for (const url of directUrls) {
        try {
          logger.info(`Trying: ${url}`);
          await this.page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 15000
          });
          
          await this.page.waitForTimeout(3000);
          
          // Check if we have articles/feed
          const hasFeed = await this.page.evaluate(() => {
            return document.querySelectorAll('article').length > 0 ||
                   document.querySelectorAll('[class*="feed"]').length > 0 ||
                   document.querySelectorAll('[class*="card"]').length > 5;
          });
          
          if (hasFeed) {
            logger.info(`✅ Feed loaded from: ${url}`);
            feedLoaded = true;
            break;
          }
        } catch (e) {
          logger.debug(`URL failed: ${e.message}`);
        }
      }
      
      // Fallback to main page
      if (!feedLoaded) {
        logger.info('Trying main page...');
        await this.page.goto('https://www.newsbreak.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await this.page.waitForTimeout(3000);
        
        // Handle location selection
        const needsLocation = await this.page.evaluate(() => {
          return document.body && document.body.innerText.includes('Choose your location');
        });
        
        if (needsLocation) {
          logger.info('Selecting location...');
          
          // Click any US city link
          const clicked = await this.page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const cityLink = links.find(a => {
              const href = a.href || '';
              const text = a.textContent || '';
              return (href.includes('-ny') || href.includes('-ca') || href.includes('-tx') ||
                     text.includes('New York') || text.includes('Los Angeles') || text.includes('Chicago'));
            });
            
            if (cityLink) {
              cityLink.click();
              return true;
            }
            
            // Click first city link as fallback
            const firstCity = document.querySelector('a[href*="/"][href*="-"]');
            if (firstCity) {
              firstCity.click();
              return true;
            }
            
            return false;
          });
          
          if (clicked) {
            logger.info('Location selected');
            await this.page.waitForTimeout(5000);
          } else {
            logger.warn('Could not select location');
          }
        }
      }
      
      // Verify we're on a feed page
      const currentUrl = this.page.url();
      const hasContent = await this.page.evaluate(() => {
        return document.querySelectorAll('article, [class*="feed"], [class*="story"], div[id*="ad"]').length > 3;
      });
      
      if (hasContent) {
        logger.info(`✅ Feed page loaded: ${currentUrl}`);
      } else {
        logger.warn(`⚠️ May not be on feed. URL: ${currentUrl}`);
      }
      
      // Check for ad blockers
      await this.checkForAdBlockers();
      
      logger.info('✅ Successfully navigated to NewsBreak');
      return true;
    } catch (error) {
      logger.error('Navigation failed:', error);
      throw error;
    }
  }

  async smartScroll(distance = 300) {
    await this.page.evaluate((scrollDistance) => {
      window.scrollBy({
        top: scrollDistance,
        behavior: 'smooth'
      });
    }, distance);
    await this.page.waitForTimeout(1500 + Math.random() * 1000);
  }

  async takeScreenshot(fileName) {
    try {
      const screenshotPath = `screenshots/${fileName}_${Date.now()}.png`;
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: false,
        type: 'png'
      });
      logger.info(`Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      logger.error('Screenshot failed:', error);
      return null;
    }
  }

  async close() {
    await this.cleanup();
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
      }
      logger.info('AdsPower connection closed');
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  }
}

module.exports = AdsPowerDirectConnect;