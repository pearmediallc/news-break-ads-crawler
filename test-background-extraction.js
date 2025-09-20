// Test background extraction service
const BackgroundExtractionService = require('./src/services/backgroundExtractor');
const logger = require('./src/utils/logger');

async function testBackgroundExtraction() {
  const service = new BackgroundExtractionService();

  try {
    logger.info('🚀 Testing background extraction service...');

    // Test 1: Initialize service
    logger.info('📋 Test 1: Initializing service...');
    await service.initialize();
    logger.info('✅ Service initialized');

    // Test 2: Start unlimited extraction (we'll stop it after a few seconds)
    logger.info('📋 Test 2: Starting unlimited extraction...');
    const result = await service.startExtraction({
      url: 'https://www.newsbreak.com/new-york-ny',
      extractionMode: 'unlimited',
      deviceMode: 'desktop'
    });

    logger.info(`✅ Started extraction: ${result.extractionId}`);

    // Test 3: Check status
    logger.info('📋 Test 3: Checking extraction status...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const status = await service.getExtractionStatus(result.extractionId);
    logger.info(`✅ Status: ${status.status}, Total Ads: ${status.totalAds || 0}`);

    // Test 4: Stop extraction
    logger.info('📋 Test 4: Stopping extraction...');
    await service.stopExtraction(result.extractionId);
    logger.info('✅ Extraction stopped');

    // Test 5: Check final status
    const finalStatus = await service.getExtractionStatus(result.extractionId);
    logger.info(`✅ Final status: ${finalStatus.status}`);

    // Test 6: Test timed extraction
    logger.info('📋 Test 6: Testing 1-minute timed extraction...');
    const timedResult = await service.startExtraction({
      url: 'https://www.newsbreak.com/new-york-ny',
      duration: 1, // 1 minute
      extractionMode: 'timed',
      deviceMode: 'desktop'
    });

    logger.info(`✅ Started timed extraction: ${timedResult.extractionId}`);

    // Monitor for 30 seconds
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const currentStatus = await service.getExtractionStatus(timedResult.extractionId);
      logger.info(`Status check ${i + 1}: ${currentStatus.status}, Progress: ${currentStatus.progress || 0}%, Ads: ${currentStatus.totalAds || 0}`);
    }

    logger.info('🎉 Background extraction tests completed successfully!');

  } catch (error) {
    logger.error('❌ Background extraction test failed:', error);
    throw error;
  } finally {
    // Clean up
    await service.cleanup();
    logger.info('🧹 Cleanup completed');
  }
}

// Run the test
if (require.main === module) {
  testBackgroundExtraction()
    .then(() => {
      logger.info('🏁 Background extraction test completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('🚨 Background extraction test failed:', error);
      process.exit(1);
    });
}

module.exports = testBackgroundExtraction;