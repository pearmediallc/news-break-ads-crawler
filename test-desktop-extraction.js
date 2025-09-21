#!/usr/bin/env node

/**
 * Test script to verify desktop mode extraction with enhanced ForYou selectors
 */

const BackgroundExtractionService = require('./src/services/backgroundExtractor');

async function testDesktopExtraction() {
  console.log('🧪 Testing Desktop Mode Extraction with Enhanced ForYou Selectors');
  console.log('='.repeat(70));

  const backgroundExtractor = new BackgroundExtractionService();

  try {
    // Initialize the service
    await backgroundExtractor.initialize();
    console.log('✅ Background extraction service initialized');

    // Test desktop extraction
    const result = await backgroundExtractor.startExtraction({
      url: 'https://www.newsbreak.com/new-york-ny',
      duration: 2, // 2 minutes for testing
      deviceMode: 'desktop',
      extractionMode: 'unlimited', // Use unlimited to test ForYou selectors
      sessionId: `test_desktop_${Date.now()}`
    });

    console.log('✅ Desktop extraction started:', result.extractionId);
    console.log('📊 Extraction config:', result.config);

    // Monitor for 30 seconds
    console.log('\n⏳ Monitoring extraction for 30 seconds...');

    let monitorCount = 0;
    const monitorInterval = setInterval(async () => {
      try {
        const status = await backgroundExtractor.getExtractionStatus(result.extractionId);
        console.log(`\n📊 Status Check #${++monitorCount}:`);
        console.log(`  Status: ${status.status}`);
        console.log(`  Total Ads: ${status.totalAds || 0}`);
        console.log(`  Logs: ${(status.logs || []).length} entries`);

        if (status.logs && status.logs.length > 0) {
          const recentLogs = status.logs.slice(-3);
          console.log('  Recent logs:');
          recentLogs.forEach(log => {
            console.log(`    ${log.timestamp}: ${log.message}`);
          });
        }

        if (monitorCount >= 6) { // Stop after 30 seconds (6 * 5s intervals)
          clearInterval(monitorInterval);

          // Stop the extraction
          console.log('\n🛑 Stopping extraction...');
          await backgroundExtractor.stopExtraction(result.extractionId);

          // Get final status
          const finalStatus = await backgroundExtractor.getExtractionStatus(result.extractionId);
          console.log('\n📊 Final Results:');
          console.log(`  Status: ${finalStatus.status}`);
          console.log(`  Total Ads Found: ${finalStatus.totalAds || 0}`);
          console.log(`  Session File: ${finalStatus.sessionFile || 'N/A'}`);

          if (finalStatus.totalAds > 0) {
            console.log('✅ SUCCESS: Desktop extraction found ads with enhanced ForYou selectors!');
          } else {
            console.log('⚠️  WARNING: No ads found - check selector compatibility');
          }

          process.exit(0);
        }
      } catch (error) {
        console.error('❌ Monitor error:', error.message);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(0);
});

// Run the test
testDesktopExtraction().catch(console.error);