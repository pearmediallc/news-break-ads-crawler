// src/crawlers/browserManager.js
const { chromium } = require('playwright');
const logger = require('../utils/logger');
const config = require('../utils/config');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async initialize() {
    try {
      logger.info('Initializing browser...');
      
      const launchOptions = {
        headless: config.crawler.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-notifications',
          '--allow-running-insecure-content',
          '--autoplay-policy=no-user-gesture-required',
          '--start-maximized'
        ]
      };

      // Add proxy configuration if enabled
      if (config.proxy.enabled && config.proxy.server) {
        logger.info(`Using proxy: ${config.proxy.server}`);
        launchOptions.proxy = {
          server: config.proxy.server
        };
        
        // Only add username/password if they exist and are strings
        if (config.proxy.username && typeof config.proxy.username === 'string') {
          launchOptions.proxy.username = config.proxy.username;
        }
        if (config.proxy.password && typeof config.proxy.password === 'string') {
          launchOptions.proxy.password = config.proxy.password;
        }
        if (config.proxy.bypass && typeof config.proxy.bypass === 'string') {
          launchOptions.proxy.bypass = config.proxy.bypass;
        }
      }

      this.browser = await chromium.launch(launchOptions);

      this.context = await this.browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        permissions: ['camera', 'microphone'],
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true
      });

      this.page = await this.context.newPage();
      
      await this.setupStealth();
      
      logger.info('Browser initialized successfully');
      return this.page;
    } catch (error) {
      logger.error('Browser initialization failed:', error);
      throw error;
    }
  }

  async setupStealth() {
    await this.page.addInitScript(() => {
      // Remove webdriver traces
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Mock chrome runtime
      window.chrome = { runtime: {} };

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ],
      });

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'granted' }) :
          originalQuery(parameters)
      );
    });
  }

  async navigateToNewsBreak() {
    try {
      const url = config.crawler.url || 'https://www.newsbreak.com/new-york';
      logger.info(`Navigating to NewsBreak: ${url}`);

      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.crawler.timeout
      });

      // Wait for some content to load
      await this.page.waitForTimeout(5000);
      
      // Try to wait for some common elements that might indicate the page is ready
      try {
        await this.page.waitForSelector('body', { timeout: 10000 });
      } catch (e) {
        logger.warn('Could not find body element, continuing anyway');
      }

      logger.info('Successfully navigated to NewsBreak');
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

    // Wait for content to load
    await this.page.waitForTimeout(1500 + Math.random() * 1000);
  }

  async takeScreenshot(fileName) {
    try {
      const screenshotPath = `${config.paths.screenshots}/${fileName}_${Date.now()}.png`;
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
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('Browser closed successfully');
      }
    } catch (error) {
      logger.error('Browser close failed:', error);
    }
  }
}

module.exports = BrowserManager;