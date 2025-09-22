const express = require('express');
const DatabaseModels = require('../database/models');
const logger = require('../utils/logger');

const router = express.Router();
const db = new DatabaseModels();

// Initialize database connection
router.use(async (req, res, next) => {
  try {
    if (!db.db || !db.db.isConnected()) {
      await db.initialize();
    }
    next();
  } catch (error) {
    logger.error('Database connection failed:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Query ads with filters
router.get('/ads', async (req, res) => {
  try {
    const filters = {
      sessionId: req.query.session_id,
      adNetwork: req.query.ad_network,
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 100
    };

    // Remove null/undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
        delete filters[key];
      }
    });

    const ads = await db.queryAds(filters);
    res.json({
      success: true,
      count: ads.length,
      filters: filters,
      data: ads
    });
  } catch (error) {
    logger.error('Failed to query ads:', error);
    res.status(500).json({ error: 'Failed to query ads', details: error.message });
  }
});

// Get ads by session
router.get('/ads/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || null;
    const offset = parseInt(req.query.offset) || 0;

    const ads = await db.getSessionAds(sessionId, limit, offset);
    res.json({
      success: true,
      sessionId: sessionId,
      count: ads.length,
      data: ads
    });
  } catch (error) {
    logger.error('Failed to get session ads:', error);
    res.status(500).json({ error: 'Failed to get session ads', details: error.message });
  }
});

// Get recent ads (last N minutes)
router.get('/ads/recent', async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes) || 5;
    const ads = await db.getRecentAds(minutes);

    res.json({
      success: true,
      timeframe: `${minutes} minutes`,
      count: ads.length,
      data: ads
    });
  } catch (error) {
    logger.error('Failed to get recent ads:', error);
    res.status(500).json({ error: 'Failed to get recent ads', details: error.message });
  }
});

// Database health check endpoint
router.get('/health', async (req, res) => {
  try {
    console.log('🔍 Database health check requested');

    // Check if database is connected
    if (!db.db || !db.db.isConnected()) {
      console.log('⚠️ Database not connected, attempting initialization...');
      await db.initialize();
    }

    // Get basic stats
    const totalAds = await db.db.get('SELECT COUNT(*) as count FROM ads');
    const totalSessions = await db.db.get('SELECT COUNT(*) as count FROM sessions');
    const recentAds = await db.db.all('SELECT * FROM ads ORDER BY timestamp DESC LIMIT 5');
    const allSessions = await db.db.all('SELECT session_id, start_time, total_ads FROM sessions ORDER BY start_time DESC LIMIT 5');

    console.log('📊 Database health check results:', {
      totalAds: totalAds?.count || 0,
      totalSessions: totalSessions?.count || 0,
      recentAdsCount: recentAds?.length || 0,
      sessionsCount: allSessions?.length || 0
    });

    res.json({
      success: true,
      connected: true,
      stats: {
        totalAds: totalAds?.count || 0,
        totalSessions: totalSessions?.count || 0,
        recentAds: recentAds?.length || 0
      },
      recentAds: recentAds || [],
      sessions: allSessions || []
    });
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    res.json({
      success: false,
      connected: false,
      error: error.message,
      stats: { totalAds: 0, totalSessions: 0, recentAds: 0 }
    });
  }
});

// Get all sessions
router.get('/sessions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const sessions = await db.getSessions(limit, offset);
    res.json({
      success: true,
      count: sessions.length,
      data: sessions
    });
  } catch (error) {
    logger.error('Failed to get sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions', details: error.message });
  }
});

// Get session details
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await db.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    logger.error('Failed to get session:', error);
    res.status(500).json({ error: 'Failed to get session', details: error.message });
  }
});

// Analytics endpoints

// Get ad network statistics
router.get('/analytics/networks', async (req, res) => {
  try {
    const stats = await db.getAdNetworkStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get ad network stats:', error);
    res.status(500).json({ error: 'Failed to get ad network stats', details: error.message });
  }
});

// Get overall session statistics
router.get('/analytics/sessions', async (req, res) => {
  try {
    const stats = await db.getSessionStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get session stats:', error);
    res.status(500).json({ error: 'Failed to get session stats', details: error.message });
  }
});

// Get daily statistics
router.get('/analytics/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await db.getDailyStats(days);

    res.json({
      success: true,
      timeframe: `${days} days`,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get daily stats:', error);
    res.status(500).json({ error: 'Failed to get daily stats', details: error.message });
  }
});

// Advanced query endpoint with SQL-like filtering
router.post('/ads/query', async (req, res) => {
  try {
    console.log('🔍 Load DB Query received:', JSON.stringify(req.body, null, 2));

    // Check if database is connected
    if (!db.db || !db.db.isConnected()) {
      try {
        await db.initialize();
        console.log('✅ Database initialized for query');
      } catch (initError) {
        console.error('❌ Database initialization failed for query:', initError);
        logger.error('Database initialization failed for query:', initError);
        return res.json({
          success: true,
          query: req.body,
          count: 0,
          data: [],
          message: 'Database not available - no ads to display'
        });
      }
    }

    const {
      filters = {},
      sort = { field: 'timestamp', direction: 'DESC' },
      pagination = { limit: 10000, offset: 0 }  // Increased default limit to 10,000 for unlimited extraction
    } = req.body;

    console.log('📋 Query filters:', filters);

    // First, check total ads in database
    try {
      const totalAdsResult = await db.db.get('SELECT COUNT(*) as count FROM ads');
      console.log(`📊 Total ads in database: ${totalAdsResult ? totalAdsResult.count : 0}`);
    } catch (countError) {
      console.error('❌ Failed to count total ads:', countError);
    }

    // Check sessions in database
    try {
      const sessionsResult = await db.db.all('SELECT DISTINCT session_id FROM ads ORDER BY session_id DESC LIMIT 10');
      console.log('📋 Sessions with ads in database:', sessionsResult.map(s => s.session_id));
    } catch (sessionError) {
      console.error('❌ Failed to get sessions:', sessionError);
    }

    // Build dynamic query
    let sql = 'SELECT * FROM ads WHERE 1=1';
    const params = [];

    // Apply filters
    if (filters.sessionIds && Array.isArray(filters.sessionIds)) {
      console.log('🎯 Filtering by session IDs:', filters.sessionIds);
      const placeholders = filters.sessionIds.map(() => '?').join(',');
      sql += ` AND session_id IN (${placeholders})`;
      params.push(...filters.sessionIds);
    }

    if (filters.adNetworks && Array.isArray(filters.adNetworks)) {
      const placeholders = filters.adNetworks.map(() => '?').join(',');
      sql += ` AND ad_network IN (${placeholders})`;
      params.push(...filters.adNetworks);
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        sql += ' AND timestamp >= ?';
        params.push(filters.dateRange.start);
      }
      if (filters.dateRange.end) {
        sql += ' AND timestamp <= ?';
        params.push(filters.dateRange.end);
      }
    }

    if (filters.searchText) {
      sql += ' AND (heading LIKE ? OR description LIKE ?)';
      params.push(`%${filters.searchText}%`, `%${filters.searchText}%`);
    }

    // Apply sorting
    const allowedSortFields = ['timestamp', 'session_id', 'ad_network', 'heading'];
    const sortField = allowedSortFields.includes(sort.field) ? sort.field : 'timestamp';
    const sortDirection = sort.direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortField} ${sortDirection}`;

    // Apply pagination
    sql += ' LIMIT ? OFFSET ?';
    params.push(pagination.limit, pagination.offset);

    console.log('🔍 Final SQL query:', sql);
    console.log('📋 Query parameters:', params);

    const ads = await db.db.all(sql, params);
    console.log(`✅ Query result: ${ads ? ads.length : 0} ads found`);

    if (ads && ads.length > 0) {
      console.log('📦 Sample ad data:', {
        session_id: ads[0].session_id,
        heading: ads[0].heading,
        ad_network: ads[0].ad_network,
        timestamp: ads[0].timestamp
      });
    }

    res.json({
      success: true,
      query: { filters, sort, pagination },
      count: ads.length,
      data: ads || [],
      debug: {
        sql: sql,
        params: params,
        totalParams: params.length
      }
    });
  } catch (error) {
    console.error('❌ Advanced query failed:', error);
    logger.error('Failed to execute advanced query:', error);
    // Return empty result set instead of error
    res.json({
      success: true,
      query: req.body,
      count: 0,
      data: [],
      error: error.message,
      debug: {
        errorMessage: error.message,
        errorStack: error.stack
      }
    });
  }
});

module.exports = router;