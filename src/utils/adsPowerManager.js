// src/utils/adsPowerManager.js
const axios = require('axios');
const logger = require('./logger');

class AdsPowerManager {
  constructor() {
    this.apiBase = 'http://local.adspower.net:50325';
    this.profiles = new Map();
    this.activeProfiles = new Map();
  }

  /**
   * Get list of available browser profiles
   */
  async getProfiles(group_id = null) {
    try {
      const params = {
        page: 1,
        page_size: 100
      };
      
      if (group_id) {
        params.group_id = group_id;
      }

      const response = await axios.get(`${this.apiBase}/api/v1/user/list`, {
        params,
        timeout: 10000
      });

      if (response.data.code !== 0) {
        throw new Error(`AdsPower API Error: ${response.data.msg}`);
      }

      const profiles = response.data.data.list || [];
      
      // Cache profiles
      profiles.forEach(profile => {
        this.profiles.set(profile.user_id, profile);
      });

      logger.info(`Found ${profiles.length} AdsPower profiles`);
      return profiles;

    } catch (error) {
      logger.error('Failed to get AdsPower profiles:', error.message);
      throw error;
    }
  }

  /**
   * Get USA profiles only
   */
  async getUSAProfiles() {
    try {
      // Add delay to avoid rate limiting
      await this.delay(1000);
      
      const allProfiles = await this.getProfiles();
      
      // Filter for USA profiles based on proxy country or profile settings
      const usaProfiles = allProfiles.filter(profile => {
        const country = profile.country?.toLowerCase();
        const proxyCountry = profile.ip_country?.toLowerCase();
        const remarks = profile.remark?.toLowerCase() || '';
        
        return country === 'us' || 
               country === 'usa' || 
               country === 'united states' ||
               proxyCountry === 'us' ||
               proxyCountry === 'usa' ||
               remarks.includes('usa') ||
               remarks.includes('us') ||
               remarks.includes('america');
      });

      logger.info(`Found ${usaProfiles.length} USA profiles out of ${allProfiles.length} total`);
      return usaProfiles;

    } catch (error) {
      logger.error('Failed to get USA profiles:', error.message);
      throw error;
    }
  }

  /**
   * Start a browser profile
   */
  async startProfile(user_id, options = {}) {
    try {
      logger.info(`Starting AdsPower profile: ${user_id}`);

      const params = {
        user_id,
        open_tabs: options.open_tabs || 0,
        ip_tab: options.ip_tab || 0,
        new_first_tab: options.new_first_tab || 1,
        launch_args: options.launch_args || [],
        headless: options.headless || 0
      };

      const response = await axios.get(`${this.apiBase}/api/v1/browser/start`, {
        params,
        timeout: 30000
      });

      if (response.data.code !== 0) {
        throw new Error(`Failed to start profile: ${response.data.msg}`);
      }

      const profileData = response.data.data;
      this.activeProfiles.set(user_id, profileData);

      logger.info(`Profile started successfully: ${user_id}`);
      logger.info(`WebDriver URL: ${profileData.webdriver}`);
      logger.info(`Debug URL: ${profileData.ws.selenium}`);

      return profileData;

    } catch (error) {
      logger.error(`Failed to start profile ${user_id}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop a browser profile
   */
  async stopProfile(user_id) {
    try {
      logger.info(`Stopping AdsPower profile: ${user_id}`);

      const response = await axios.get(`${this.apiBase}/api/v1/browser/stop`, {
        params: { user_id },
        timeout: 10000
      });

      if (response.data.code !== 0) {
        logger.warn(`Failed to stop profile: ${response.data.msg}`);
      }

      this.activeProfiles.delete(user_id);
      logger.info(`Profile stopped: ${user_id}`);

    } catch (error) {
      logger.error(`Failed to stop profile ${user_id}:`, error.message);
    }
  }

  /**
   * Get profile status
   */
  async getProfileStatus(user_id) {
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
      logger.debug(`Profile ${user_id} status check failed:`, error.message);
      return { active: false, data: null };
    }
  }

  /**
   * Create a new USA profile
   */
  async createUSAProfile(options = {}) {
    try {
      logger.info('Creating new USA profile...');

      const profileData = {
        name: options.name || `USA_Profile_${Date.now()}`,
        domain_name: options.domain || 'newsbreak.com',
        open_urls: options.open_urls || ['https://www.newsbreak.com'],
        repeat_config: options.repeat_config || [0],
        username: options.username || '',
        password: options.password || '',
        fakey: options.fakey || '',
        cookie: options.cookie || '',
        ignore_cookie_error: options.ignore_cookie_error || 1,
        ip: options.ip || '',
        country: options.country || 'US',
        region: options.region || '',
        city: options.city || '',
        remark: options.remark || 'Auto-created USA profile for NewsBreak',
        ipchecker: options.ipchecker || 1,
        sys: options.sys || 'Windows',
        recovery: options.recovery || '',
        ...options.additional_settings
      };

      const response = await axios.post(`${this.apiBase}/api/v1/user/create`, profileData, {
        timeout: 15000
      });

      if (response.data.code !== 0) {
        throw new Error(`Failed to create profile: ${response.data.msg}`);
      }

      const newProfile = response.data.data;
      this.profiles.set(newProfile.id, newProfile);

      logger.info(`Created USA profile: ${newProfile.id}`);
      return newProfile;

    } catch (error) {
      logger.error('Failed to create USA profile:', error.message);
      throw error;
    }
  }

  /**
   * Get the best USA profile for crawling
   */
  async getBestUSAProfile(options = {}) {
    try {
      const usaProfiles = await this.getUSAProfiles();
      
      if (usaProfiles.length === 0) {
        logger.warn('No USA profiles found, creating new one...');
        return await this.createUSAProfile(options);
      }

      // Find an inactive profile
      for (const profile of usaProfiles) {
        const status = await this.getProfileStatus(profile.user_id);
        if (!status.active) {
          logger.info(`Using existing USA profile: ${profile.user_id} (${profile.name})`);
          return profile;
        }
      }

      // If all profiles are active, use the first one
      logger.info(`All profiles active, using: ${usaProfiles[0].user_id}`);
      return usaProfiles[0];

    } catch (error) {
      logger.error('Failed to get best USA profile:', error.message);
      throw error;
    }
  }

  /**
   * Check if AdsPower is running
   */
  async checkAdsPowerStatus() {
    try {
      const response = await axios.get(`${this.apiBase}/status`, {
        timeout: 5000
      });
      
      logger.info('✅ AdsPower is running and accessible');
      return true;

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.error('❌ AdsPower is not running or not accessible on port 50325');
        logger.error('Please start AdsPower application first');
      } else {
        logger.error('❌ AdsPower connection failed:', error.message);
      }
      return false;
    }
  }

  /**
   * Get all currently active (open) browser profiles
   */
  async getActiveProfiles() {
    try {
      logger.info('Checking for already open AdsPower browsers...');
      
      const allProfiles = await this.getProfiles();
      const activeProfiles = [];
      
      for (const profile of allProfiles) {
        const status = await this.getProfileStatus(profile.user_id);
        if (status.active) {
          activeProfiles.push({
            ...profile,
            connectionData: status.data
          });
        }
      }
      
      logger.info(`Found ${activeProfiles.length} already open AdsPower browsers`);
      return activeProfiles;
      
    } catch (error) {
      logger.error('Failed to get active profiles:', error.message);
      return [];
    }
  }

  /**
   * Get the best active USA profile (already open browser)
   */
  async getBestActiveUSAProfile() {
    try {
      const activeProfiles = await this.getActiveProfiles();
      
      if (activeProfiles.length === 0) {
        logger.info('No active AdsPower browsers found');
        return null;
      }
      
      // Filter for USA profiles that are already open
      const usaActiveProfiles = activeProfiles.filter(profile => {
        const country = profile.country?.toLowerCase();
        const proxyCountry = profile.ip_country?.toLowerCase();
        const remarks = profile.remark?.toLowerCase() || '';
        
        return country === 'us' || 
               country === 'usa' || 
               country === 'united states' ||
               proxyCountry === 'us' ||
               proxyCountry === 'usa' ||
               remarks.includes('usa') ||
               remarks.includes('us') ||
               remarks.includes('america');
      });

      if (usaActiveProfiles.length > 0) {
        const profile = usaActiveProfiles[0];
        logger.info(`✅ Found open USA AdsPower browser: ${profile.user_id} (${profile.name})`);
        logger.info(`   Country: ${profile.country || profile.ip_country || 'Unknown'}`);
        logger.info(`   Status: Already running - no additional setup needed`);
        return profile;
      }
      
      // If no USA profiles, return any active profile
      if (activeProfiles.length > 0) {
        const profile = activeProfiles[0];
        logger.info(`Found open AdsPower browser (non-USA): ${profile.user_id} (${profile.name})`);
        logger.warn('Profile may not be USA-based, consider using a USA profile for better results');
        return profile;
      }
      
      return null;
      
    } catch (error) {
      logger.error('Failed to get best active USA profile:', error.message);
      return null;
    }
  }

  /**
   * Connect to an already running profile without starting it
   */
  async connectToActiveProfile(profile) {
    try {
      logger.info(`Connecting to already open AdsPower browser: ${profile.user_id}`);
      
      // Get fresh connection data
      const status = await this.getProfileStatus(profile.user_id);
      
      if (!status.active) {
        throw new Error('Profile is no longer active');
      }
      
      // If no connection data, we need to restart the profile to get proper connection
      if (!status.data || !status.data.ws || !status.data.ws.selenium) {
        logger.info('Profile is running but needs restart for proper connection data...');
        
        // Stop and restart the profile to get connection data
        await this.stopProfile(profile.user_id);
        await this.delay(2000);
        
        const profileData = await this.startProfile(profile.user_id, {
          headless: 0,
          new_first_tab: 1,
          open_tabs: 0
        });
        
        return profileData;
      }
      
      // Store in active profiles for cleanup tracking
      this.activeProfiles.set(profile.user_id, status.data);
      
      logger.info('✅ Connected to existing AdsPower browser successfully');
      logger.info(`   WebDriver URL: ${status.data.webdriver || 'N/A'}`);
      logger.info(`   Debug URL: ${status.data.ws?.selenium || 'N/A'}`);
      
      return status.data;
      
    } catch (error) {
      logger.error(`Failed to connect to active profile ${profile.user_id}:`, error.message);
      throw error;
    }
  }

  /**
   * Cleanup - stop all active profiles
   */
  async cleanup() {
    logger.info('Cleaning up AdsPower profiles...');
    
    const stopPromises = Array.from(this.activeProfiles.keys()).map(user_id => 
      this.stopProfile(user_id).catch(err => 
        logger.warn(`Failed to stop profile ${user_id}:`, err.message)
      )
    );

    await Promise.all(stopPromises);
    this.activeProfiles.clear();
    
    logger.info('AdsPower cleanup completed');
  }

  /**
   * Get profile connection URL for Playwright
   */
  getProfileConnectionURL(profileData) {
    if (!profileData.ws || !profileData.ws.selenium) {
      throw new Error('No WebDriver connection URL available');
    }

    return profileData.ws.selenium;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AdsPowerManager;