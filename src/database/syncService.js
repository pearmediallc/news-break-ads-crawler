const DatabaseModels = require('./models');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseSyncService {
  constructor() {
    this.db = new DatabaseModels();
    this.dataDir = path.join(process.cwd(), 'data');
    this.sessionsDir = path.join(this.dataDir, 'sessions');
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.db.initialize();
      this.initialized = true;
      logger.info('Database sync service initialized');
    } catch (error) {
      logger.error('Failed to initialize database sync service:', error.message);

      // Don't throw - mark as not initialized
      // This allows the extraction to continue with file-only storage
      this.initialized = false;

      logger.warn('Database sync service will be disabled - using file storage only');
      logger.warn('Ads will still be saved to JSON session files');
    }
  }

  // Sync session data to database
  async syncSession(sessionData) {
    try {
      // Skip if database is not initialized
      if (!this.initialized) {
        logger.debug('Database not initialized, skipping session sync');
        return;
      }

      // Check if session already exists
      const existingSession = await this.db.getSession(sessionData.sessionId || sessionData.timestamp);

      if (existingSession) {
        // Update existing session
        await this.db.updateSession(sessionData.sessionId || sessionData.timestamp, {
          end_time: sessionData.endTime || new Date().toISOString(),
          total_ads: sessionData.totalAds || sessionData.ads?.length || 0,
          status: 'completed'
        });
      } else {
        // Create new session
        await this.db.createSession({
          sessionId: sessionData.sessionId || sessionData.timestamp,
          startTime: sessionData.startTime || sessionData.timestamp,
          url: sessionData.url,
          duration: sessionData.duration,
          deviceMode: sessionData.deviceMode,
          filePath: sessionData.file
        });
      }

      // Sync ads if present
      if (sessionData.ads && sessionData.ads.length > 0) {
        await this.db.saveAds(sessionData.ads, sessionData.sessionId || sessionData.timestamp);
      }

      logger.info(`Synced session to database: ${sessionData.sessionId || sessionData.timestamp}`);
    } catch (error) {
      logger.error('Failed to sync session:', error);
      throw error;
    }
  }

  // Sync ads to database
  async syncAds(ads, sessionId) {
    try {
      console.log(`🔄 DatabaseSyncService.syncAds called: ${ads?.length} ads for session ${sessionId}`);
      console.log(`📊 Database initialized: ${this.initialized}`);

      // Skip if database is not initialized
      if (!this.initialized) {
        console.warn('⚠️ Database not initialized, skipping ad sync');
        logger.debug('Database not initialized, skipping ad sync');
        return;
      }

      if (!ads || ads.length === 0) {
        console.log('📭 No ads to sync');
        return;
      }

      console.log('💾 Saving ads to database...');
      const result = await this.db.saveAds(ads, sessionId);
      console.log(`✅ Database sync result:`, result);

      logger.info(`Synced ${ads.length} ads to database for session ${sessionId}`);
      console.log(`✅ Successfully synced ${ads.length} ads to database for session ${sessionId}`);
    } catch (error) {
      console.error('❌ Failed to sync ads to database:', error);
      logger.error('Failed to sync ads:', error.message);
      // Don't throw - allow extraction to continue
      // Ads are still saved in JSON session files
    }
  }

  // Sync all existing session files to database
  async syncAllExistingSessions() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      logger.info('Starting sync of all existing sessions...');

      // Read sessions index
      const indexFile = path.join(this.sessionsDir, 'index.json');
      if (await fs.exists(indexFile)) {
        const sessionsIndex = await fs.readJson(indexFile);

        for (const sessionInfo of sessionsIndex) {
          try {
            const sessionFile = path.join(this.sessionsDir, sessionInfo.file);
            if (await fs.exists(sessionFile)) {
              const sessionData = await fs.readJson(sessionFile);

              // Add session info to session data
              sessionData.sessionId = sessionInfo.timestamp;
              sessionData.file = sessionInfo.file;

              await this.syncSession(sessionData);
            }
          } catch (error) {
            logger.error(`Failed to sync session ${sessionInfo.file}:`, error);
          }
        }
      }

      // Also check for other session files not in index
      const sessionFiles = await fs.readdir(this.sessionsDir);
      for (const file of sessionFiles) {
        if (file.endsWith('.json') && file !== 'index.json') {
          try {
            const sessionFile = path.join(this.sessionsDir, file);
            const sessionData = await fs.readJson(sessionFile);

            // Extract session ID from filename or data
            const sessionId = sessionData.sessionId ||
                            sessionData.timestamp ||
                            file.replace(/^(session_|ads_)/, '').replace('.json', '');

            sessionData.sessionId = sessionId;
            sessionData.file = file;

            // Check if already synced
            const existing = await this.db.getSession(sessionId);
            if (!existing) {
              await this.syncSession(sessionData);
            }
          } catch (error) {
            logger.warn(`Failed to sync session file ${file}:`, error.message);
          }
        }
      }

      logger.info('Completed sync of all existing sessions');
    } catch (error) {
      logger.error('Failed to sync all existing sessions:', error);
      throw error;
    }
  }

  // Real-time sync for new data
  async syncNewData(sessionId, ads) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Sync new ads first (this will handle duplicates)
      // The database trigger will automatically update sessions.total_ads
      await this.syncAds(ads, sessionId);

      // Just update the session timestamp (total_ads is auto-updated by trigger)
      await this.db.updateSession(sessionId, {
        updated_at: new Date().toISOString()
      });

      logger.debug(`Real-time sync completed for session ${sessionId}`);
    } catch (error) {
      logger.error('Failed to sync new data:', error);
      // Don't throw error to avoid breaking the main extraction process
    }
  }

  // Watch for file changes and auto-sync
  async startAutoSync() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Initial sync of all existing data
      await this.syncAllExistingSessions();

      logger.info('Auto-sync service started');
    } catch (error) {
      logger.error('Failed to start auto-sync:', error);
      throw error;
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
    }
  }

  // Helper method to create session from extraction data
  createSessionFromExtraction(extractorInstance) {
    return {
      sessionId: extractorInstance.sessionTimestamp,
      startTime: extractorInstance.sessionTimestamp,
      url: extractorInstance.targetUrl,
      duration: extractorInstance.duration,
      deviceMode: extractorInstance.deviceMode || 'desktop',
      totalAds: extractorInstance.extractedAds?.length || 0,
      ads: extractorInstance.extractedAds || []
    };
  }
}

module.exports = DatabaseSyncService;