const DatabaseConnection = require('./connection');
const logger = require('../utils/logger');

class DatabaseModels {
  constructor() {
    this.db = new DatabaseConnection();
  }

  async initialize() {
    await this.db.initialize();
  }

  // Session operations
  async createSession(sessionData) {
    try {
      const sql = `
        INSERT INTO sessions (session_id, start_time, url, duration, device_mode, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const params = [
        sessionData.sessionId,
        sessionData.startTime,
        sessionData.url || null,
        sessionData.duration || null,
        sessionData.deviceMode || null,
        sessionData.filePath || null
      ];

      const result = await this.db.run(sql, params);
      logger.info(`Created session in database: ${sessionData.sessionId}`);
      return result;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  async updateSession(sessionId, updates) {
    try {
      const setParts = [];
      const params = [];

      Object.keys(updates).forEach(key => {
        setParts.push(`${key} = ?`);
        params.push(updates[key]);
      });

      setParts.push('updated_at = CURRENT_TIMESTAMP');
      params.push(sessionId);

      const sql = `UPDATE sessions SET ${setParts.join(', ')} WHERE session_id = ?`;

      const result = await this.db.run(sql, params);
      logger.debug(`Updated session: ${sessionId}`);
      return result;
    } catch (error) {
      logger.error('Failed to update session:', error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      const sql = 'SELECT * FROM sessions WHERE session_id = ?';
      return await this.db.get(sql, [sessionId]);
    } catch (error) {
      logger.error('Failed to get session:', error);
      throw error;
    }
  }

  async getSessions(limit = 50, offset = 0) {
    try {
      const sql = `
        SELECT * FROM sessions
        ORDER BY start_time DESC
        LIMIT ? OFFSET ?
      `;
      return await this.db.all(sql, [limit, offset]);
    } catch (error) {
      logger.error('Failed to get sessions:', error);
      throw error;
    }
  }

  // Ad operations
  async saveAd(adData) {
    try {
      // First check if ad already exists (avoid duplicates)
      if (adData.id || adData.ad_id) {
        const existing = await this.db.get(
          'SELECT id FROM ads WHERE ad_id = ? AND session_id = ?',
          [adData.id || adData.ad_id, adData.sessionId]
        );
        if (existing) {
          logger.debug(`Ad already exists: ${adData.id || adData.ad_id}`);
          return { id: existing.id, changes: 0 };
        }
      }

      const sql = `
        INSERT INTO ads (
          session_id, ad_id, heading, description, image_url, link_url,
          ad_network, timestamp, element_html, position_x, position_y,
          width, height, viewport_width, viewport_height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        adData.sessionId,
        adData.id || adData.ad_id || null,
        adData.heading || adData.headline || null,  // Support both 'heading' and 'headline'
        adData.description || adData.body || null,  // Support both 'description' and 'body'
        adData.image || adData.imageUrl || adData.image_url || null,
        adData.link || adData.linkUrl || adData.link_url || null,
        adData.adNetwork || adData.ad_network || adData.advertiser || null,  // Support 'advertiser' field
        adData.timestamp || new Date().toISOString(),
        adData.elementHtml || adData.element_html || null,
        adData.position?.x || adData.position_x || null,
        adData.position?.y || adData.position_y || null,
        adData.dimensions?.width || adData.width || null,
        adData.dimensions?.height || adData.height || null,
        adData.viewport?.width || adData.viewport_width || null,
        adData.viewport?.height || adData.viewport_height || null
      ];

      const result = await this.db.run(sql, params);
      logger.debug(`Saved ad to database: session ${adData.sessionId}`);
      return result;
    } catch (error) {
      // Check if it's a unique constraint violation (duplicate)
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        logger.debug('Duplicate ad detected, skipping');
        return { id: null, changes: 0 };
      }
      logger.error('Failed to save ad:', error);
      throw error;
    }
  }

  async saveAds(ads, sessionId) {
    try {
      console.log(`💾 DatabaseModels.saveAds called: ${ads?.length} ads for session ${sessionId}`);

      let successCount = 0;
      let failCount = 0;
      const results = [];

      // Process ads one by one to handle errors gracefully
      for (const [index, ad] of ads.entries()) {
        try {
          console.log(`  📦 Saving ad ${index + 1}/${ads.length}: ${ad.headline || ad.heading || 'No headline'}`);
          const result = await this.saveAd({ ...ad, sessionId });
          results.push(result);
          if (result.changes > 0) {
            successCount++;
            console.log(`    ✅ Ad saved successfully (changes: ${result.changes})`);
          } else {
            console.log(`    ⏭️ Ad skipped (duplicate or no changes)`);
          }
        } catch (error) {
          failCount++;
          console.error(`    ❌ Failed to save ad ${index + 1}: ${error.message}`);
          logger.debug(`Failed to save individual ad: ${error.message}`);
          // Continue with next ad
        }
      }

      console.log(`✅ Database batch save complete: ${successCount} saved, ${failCount} failed/duplicates`);
      logger.info(`Saved ${successCount} ads to database for session ${sessionId} (${failCount} failed/duplicates)`);
      return results;
    } catch (error) {
      console.error('❌ Database batch save failed:', error);
      logger.error('Failed to save ads batch:', error);
      // Don't throw - return empty array to allow extraction to continue
      return [];
    }
  }

  async getSessionAds(sessionId, limit = null, offset = 0) {
    try {
      let sql = 'SELECT * FROM ads WHERE session_id = ? ORDER BY timestamp DESC';
      let params = [sessionId];

      if (limit) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      return await this.db.all(sql, params);
    } catch (error) {
      logger.error('Failed to get session ads:', error);
      throw error;
    }
  }

  async getRecentAds(minutes = 5) {
    try {
      const sql = `
        SELECT * FROM ads
        WHERE timestamp > datetime('now', '-${minutes} minutes')
        ORDER BY timestamp DESC
      `;
      return await this.db.all(sql);
    } catch (error) {
      logger.error('Failed to get recent ads:', error);
      throw error;
    }
  }

  // Query operations
  async queryAds(filters = {}) {
    try {
      let sql = 'SELECT * FROM ads WHERE 1=1';
      const params = [];

      if (filters.sessionId) {
        sql += ' AND session_id = ?';
        params.push(filters.sessionId);
      }

      if (filters.adNetwork) {
        sql += ' AND ad_network = ?';
        params.push(filters.adNetwork);
      }

      if (filters.startDate) {
        sql += ' AND timestamp >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        sql += ' AND timestamp <= ?';
        params.push(filters.endDate);
      }

      if (filters.search) {
        sql += ' AND (heading LIKE ? OR description LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }

      sql += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      return await this.db.all(sql, params);
    } catch (error) {
      logger.error('Failed to query ads:', error);
      throw error;
    }
  }

  // Analytics operations
  async getAdNetworkStats() {
    try {
      const sql = `
        SELECT
          ad_network,
          COUNT(*) as total_ads,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen
        FROM ads
        WHERE ad_network IS NOT NULL
        GROUP BY ad_network
        ORDER BY total_ads DESC
      `;
      return await this.db.all(sql);
    } catch (error) {
      logger.error('Failed to get ad network stats:', error);
      throw error;
    }
  }

  async getSessionStats() {
    try {
      const sql = `
        SELECT
          COUNT(*) as total_sessions,
          SUM(total_ads) as total_ads,
          AVG(total_ads) as avg_ads_per_session,
          MIN(start_time) as first_session,
          MAX(start_time) as last_session
        FROM sessions
      `;
      return await this.db.get(sql);
    } catch (error) {
      logger.error('Failed to get session stats:', error);
      throw error;
    }
  }

  async getDailyStats(days = 7) {
    try {
      const sql = `
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as ads_count,
          COUNT(DISTINCT session_id) as sessions_count
        FROM ads
        WHERE timestamp >= date('now', '-${days} days')
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
      `;
      return await this.db.all(sql);
    } catch (error) {
      logger.error('Failed to get daily stats:', error);
      throw error;
    }
  }

  async close() {
    await this.db.close();
  }
}

module.exports = DatabaseModels;