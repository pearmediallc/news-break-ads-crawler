// Test script for database functionality
const DatabaseModels = require('./src/database/models');
const DatabaseSyncService = require('./src/database/syncService');
const logger = require('./src/utils/logger');

async function testDatabase() {
  const db = new DatabaseModels();
  const syncService = new DatabaseSyncService();

  try {
    logger.info('🚀 Starting database tests...');

    // Test 1: Initialize database
    logger.info('📋 Test 1: Initializing database...');
    await db.initialize();
    logger.info('✅ Database initialized successfully');

    // Test 2: Create a test session
    logger.info('📋 Test 2: Creating test session...');
    const testSession = {
      sessionId: 'test-session-' + Date.now(),
      startTime: new Date().toISOString(),
      url: 'https://test.newsbreak.com',
      duration: '10m',
      deviceMode: 'desktop'
    };

    await db.createSession(testSession);
    logger.info('✅ Test session created');

    // Test 3: Save test ads
    logger.info('📋 Test 3: Saving test ads...');
    const testAds = [
      {
        sessionId: testSession.sessionId,
        heading: 'Test Ad 1',
        description: 'This is a test advertisement',
        imageUrl: 'https://example.com/image1.jpg',
        linkUrl: 'https://example.com/ad1',
        adNetwork: 'Google Ads',
        timestamp: new Date().toISOString()
      },
      {
        sessionId: testSession.sessionId,
        heading: 'Test Ad 2',
        description: 'Another test advertisement',
        imageUrl: 'https://example.com/image2.jpg',
        linkUrl: 'https://example.com/ad2',
        adNetwork: 'Facebook Ads',
        timestamp: new Date().toISOString()
      }
    ];

    await db.saveAds(testAds, testSession.sessionId);
    logger.info('✅ Test ads saved');

    // Test 4: Query ads
    logger.info('📋 Test 4: Querying ads...');
    const sessionAds = await db.getSessionAds(testSession.sessionId);
    logger.info(`✅ Retrieved ${sessionAds.length} ads for session`);

    // Test 5: Query with filters
    logger.info('📋 Test 5: Testing filtered queries...');
    const googleAds = await db.queryAds({ adNetwork: 'Google Ads' });
    logger.info(`✅ Found ${googleAds.length} Google Ads`);

    // Test 6: Analytics
    logger.info('📋 Test 6: Testing analytics...');
    const networkStats = await db.getAdNetworkStats();
    const sessionStats = await db.getSessionStats();
    logger.info(`✅ Network stats: ${networkStats.length} networks`);
    logger.info(`✅ Session stats: ${sessionStats.total_sessions} sessions, ${sessionStats.total_ads} ads`);

    // Test 7: Sync service
    logger.info('📋 Test 7: Testing sync service...');
    await syncService.initialize();

    const syncTestSession = {
      sessionId: 'sync-test-' + Date.now(),
      startTime: new Date().toISOString(),
      totalAds: 1,
      ads: [{
        heading: 'Sync Test Ad',
        description: 'Testing sync functionality',
        timestamp: new Date().toISOString()
      }]
    };

    await syncService.syncSession(syncTestSession);
    logger.info('✅ Sync service test completed');

    // Test 8: Verify data persistence
    logger.info('📋 Test 8: Verifying data persistence...');
    const allSessions = await db.getSessions(10);
    logger.info(`✅ Found ${allSessions.length} total sessions in database`);

    logger.info('🎉 All database tests completed successfully!');

    // Display some sample data
    logger.info('\n📊 Sample Data:');
    logger.info('Sessions:');
    allSessions.forEach(session => {
      logger.info(`  - ${session.session_id}: ${session.total_ads} ads (${session.start_time})`);
    });

    logger.info('\nAd Networks:');
    networkStats.forEach(network => {
      logger.info(`  - ${network.ad_network}: ${network.total_ads} ads`);
    });

  } catch (error) {
    logger.error('❌ Database test failed:', error);
    throw error;
  } finally {
    // Clean up
    await db.close();
    await syncService.close();
  }
}

// Run the test
if (require.main === module) {
  testDatabase()
    .then(() => {
      logger.info('🏁 Database test suite completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('🚨 Database test suite failed:', error);
      process.exit(1);
    });
}

module.exports = testDatabase;