// src/utils/config.js
require('dotenv').config();
const path = require('path');

const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'newsbreak_ads',
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development'
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  
  crawler: {
    url: process.env.NEWSBREAK_URL || 'https://www.newsbreak.com/new-york',
    headless: process.env.HEADLESS === 'true',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
    defaultDuration: parseInt(process.env.DEFAULT_DURATION) || 60,
    timeout: 60000,
    maxRetries: 3,
    clickAds: process.env.CLICK_ADS === 'true',
    maxAdsToClick: parseInt(process.env.MAX_ADS_TO_CLICK) || 5
  },

  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    server: process.env.PROXY_SERVER || null, // e.g., 'http://proxy-server:8080'
    username: process.env.PROXY_USERNAME || null,
    password: process.env.PROXY_PASSWORD || null,
    bypass: process.env.PROXY_BYPASS || null // e.g., 'localhost,127.0.0.1'
  },

  // AdsPower is disabled - using regular Chrome browser on US server
  adspower: {
    enabled: false, // Disabled - using regular Chrome on US server
    apiUrl: process.env.ADSPOWER_API_URL || 'http://local.adspower.net:50325',
    preferredProfile: process.env.ADSPOWER_PROFILE_ID || null, // Specific profile ID
    groupId: process.env.ADSPOWER_GROUP_ID || null, // Group to filter profiles
    useExistingBrowser: process.env.ADSPOWER_USE_EXISTING !== 'false', // Default to true - use existing open browsers
    autoCreateProfile: process.env.ADSPOWER_AUTO_CREATE === 'true',
    profileSettings: {
      name: process.env.ADSPOWER_PROFILE_NAME || 'NewsBreak_Crawler',
      country: 'US',
      remark: 'Auto-created for NewsBreak ads crawling'
    }
  },
  
  paths: {
    screenshots: path.resolve(process.env.SCREENSHOTS_DIR || './screenshots'),
    exports: path.resolve(process.env.EXPORTS_DIR || './exports'),
    archives: path.resolve(process.env.ARCHIVES_DIR || './archives'),
    logs: path.resolve('./logs')
  }
};

module.exports = config;