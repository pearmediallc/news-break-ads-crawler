// src/storage/database.js
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');

class DatabaseManager {
  constructor() {
    this.dbPath = path.join(process.cwd(), 'data');
    this.sessions = new Map();
    this.ads = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.ensureDir(this.dbPath);
      
      // Load existing data if available
      await this.loadData();
      
      this.initialized = true;
      logger.info('Database initialized successfully');
      return true;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async loadData() {
    try {
      const sessionsFile = path.join(this.dbPath, 'sessions.json');
      const adsFile = path.join(this.dbPath, 'ads.json');

      if (await fs.exists(sessionsFile)) {
        const sessionsData = await fs.readJson(sessionsFile);
        this.sessions = new Map(Object.entries(sessionsData));
      }

      if (await fs.exists(adsFile)) {
        const adsData = await fs.readJson(adsFile);
        this.ads = new Map(Object.entries(adsData));
      }

      logger.debug(`Loaded ${this.sessions.size} sessions and ${this.ads.size} ads`);
    } catch (error) {
      logger.warn('Could not load existing data:', error.message);
    }
  }

  async saveData() {
    try {
      const sessionsFile = path.join(this.dbPath, 'sessions.json');
      const adsFile = path.join(this.dbPath, 'ads.json');

      await fs.writeJson(sessionsFile, Object.fromEntries(this.sessions));
      await fs.writeJson(adsFile, Object.fromEntries(this.ads));

      logger.debug('Data saved successfully');
    } catch (error) {
      logger.error('Failed to save data:', error);
    }
  }

  async createSession(name, metadata = {}) {
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      ...metadata,
      createdAt: new Date().toISOString()
    };

    this.sessions.set(session.id, session);
    await this.saveData();

    logger.info(`Created session: ${session.id}`);
    return session;
  }

  async updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    Object.assign(session, updates, { updatedAt: new Date().toISOString() });
    this.sessions.set(sessionId, session);
    await this.saveData();

    logger.debug(`Updated session: ${sessionId}`);
  }

  async saveAd(adData) {
    const adId = adData.adId || `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const ad = {
      id: adId,
      ...adData,
      createdAt: new Date().toISOString()
    };

    this.ads.set(adId, ad);
    await this.saveData();

    logger.debug(`Saved ad: ${adId}`);
    return ad;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getSessionAds(sessionId) {
    return Array.from(this.ads.values()).filter(ad => ad.sessionId === sessionId);
  }

  async close() {
    if (this.initialized) {
      await this.saveData();
      this.initialized = false;
      logger.info('Database closed');
    }
  }
}

module.exports = DatabaseManager;