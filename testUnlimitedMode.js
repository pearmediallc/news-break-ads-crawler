// Test script for unlimited mode extraction improvements
const axios = require('axios');

async function testUnlimitedMode() {
  console.log('🧪 Testing Unlimited Mode Extraction Improvements\n');
  console.log('=========================================\n');

  const serverUrl = 'http://localhost:3000';

  try {
    // Check if server is running
    console.log('1️⃣ Checking server status...');
    const healthCheck = await axios.get(`${serverUrl}/health`);
    console.log('✅ Server is running\n');

    // Start unlimited extraction
    console.log('2️⃣ Starting unlimited mode extraction...');
    const extractionConfig = {
      url: 'https://www.newsbreak.com/new-york-ny',
      extractionMode: 'unlimited',
      deviceMode: 'desktop'
    };

    const startResponse = await axios.post(`${serverUrl}/api/extract/start`, extractionConfig);
    const extractionId = startResponse.data.extractionId;
    console.log(`✅ Extraction started with ID: ${extractionId}\n`);

    // Monitor extraction for 5 minutes
    console.log('3️⃣ Monitoring extraction progress for 5 minutes...\n');

    let previousAdCount = 0;
    const startTime = Date.now();
    const monitorDuration = 5 * 60 * 1000; // 5 minutes

    const monitorInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`${serverUrl}/api/extract/status/${extractionId}`);
        const status = statusResponse.data;

        const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
        const newAds = status.totalAds - previousAdCount;
        const adsPerMinute = status.totalAds / Math.max(1, elapsedMinutes);

        console.log(`⏱️ ${elapsedMinutes} min | 📊 Total Ads: ${status.totalAds} | 🆕 New: ${newAds} | 📈 Rate: ${adsPerMinute.toFixed(1)} ads/min`);

        // Show recent logs
        if (status.logs && status.logs.length > 0) {
          const recentLog = status.logs[status.logs.length - 1];
          console.log(`   📝 ${recentLog.message}`);
        }

        previousAdCount = status.totalAds;

        // Check if extraction stopped
        if (status.status === 'stopped' || status.status === 'error') {
          console.log(`\n⚠️ Extraction ${status.status}: ${status.error || 'Unknown reason'}`);
          clearInterval(monitorInterval);
        }

        // Stop monitoring after 5 minutes
        if (Date.now() - startTime >= monitorDuration) {
          console.log('\n4️⃣ Test complete. Analyzing results...\n');
          clearInterval(monitorInterval);

          // Calculate performance metrics
          const totalMinutes = 5;
          const totalAds = status.totalAds;
          const adsPerMinute = totalAds / totalMinutes;
          const projectedHourlyRate = adsPerMinute * 60;
          const projected8HourTotal = projectedHourlyRate * 8;

          console.log('📊 PERFORMANCE METRICS:');
          console.log('=======================');
          console.log(`✅ Ads extracted in 5 minutes: ${totalAds}`);
          console.log(`📈 Average rate: ${adsPerMinute.toFixed(1)} ads/minute`);
          console.log(`⏰ Projected hourly rate: ${Math.round(projectedHourlyRate)} ads/hour`);
          console.log(`🎯 Projected 8-hour total: ${Math.round(projected8HourTotal)} ads`);
          console.log('');

          // Compare with previous performance
          const oldRate = 35 / (8 * 60); // 35 ads in 8 hours = 0.073 ads/min
          const improvement = (adsPerMinute / oldRate);

          if (improvement > 1) {
            console.log(`🚀 IMPROVEMENT: ${improvement.toFixed(1)}x faster than before!`);
            console.log(`   (Was: 35 ads/8hrs = ${oldRate.toFixed(2)} ads/min)`);
            console.log(`   (Now: ${adsPerMinute.toFixed(2)} ads/min)`);
          } else {
            console.log(`⚠️ Performance needs improvement`);
            console.log(`   Current: ${adsPerMinute.toFixed(2)} ads/min`);
            console.log(`   Target: > ${oldRate.toFixed(2)} ads/min`);
          }

          // Stop the extraction
          console.log('\n5️⃣ Stopping extraction...');
          await axios.post(`${serverUrl}/api/extract/stop/${extractionId}`);
          console.log('✅ Extraction stopped\n');

          console.log('🎉 Test complete!');
        }
      } catch (error) {
        console.error('Error checking status:', error.message);
      }
    }, 10000); // Check every 10 seconds

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    console.log('\n💡 Make sure the server is running: npm start');
  }
}

// Run the test
testUnlimitedMode();