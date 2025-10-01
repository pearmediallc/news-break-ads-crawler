#!/usr/bin/env node

/**
 * Launch multiple workers on the SAME URL for maximum extraction from one location
 *
 * Usage:
 *   node launch-same-url-workers.js 5 "https://www.newsbreak.com/new-york-ny"
 *   node launch-same-url-workers.js 3  (uses default NYC URL)
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.AUTH_TOKEN || '';

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (TOKEN) {
      options.headers['Cookie'] = `token=${TOKEN}`;
    }

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          resolve({ error: 'Invalid JSON response', data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function launchSameUrlWorkers(numWorkers, url) {
  console.log('\n🚀 SAME-URL MULTI-THREAD EXTRACTION\n');
  console.log('─'.repeat(60));
  console.log(`📊 Workers: ${numWorkers} parallel threads`);
  console.log(`🔗 URL: ${url}`);
  console.log(`📍 Mode: ALL WORKERS ON SAME LOCATION`);
  console.log('─'.repeat(60));
  console.log('\n⚡ Starting extraction...\n');

  try {
    const result = await makeRequest('POST', '/api/extract/multi-thread/start', {
      maxWorkers: numWorkers,
      deviceMode: 'desktop',
      sameUrl: true,
      url: url
    });

    if (result.success) {
      console.log('✅ Successfully started!\n');
      console.log('📊 Status:');
      console.log(`   - Total Workers: ${result.status.maxWorkers}`);
      console.log(`   - Active Workers: ${result.status.activeWorkers}`);
      console.log(`   - Session ID: ${result.status.sessionId}`);
      console.log(`   - Mode: Same URL\n`);

      if (result.status.workers && result.status.workers.length > 0) {
        console.log('👷 Workers:');
        result.status.workers.forEach(w => {
          console.log(`   - Worker #${w.workerId}: ${w.status} on ${w.url}`);
        });
      }

      console.log('\n💡 Tips:');
      console.log('   - Check status: node test-multi-thread.js status');
      console.log('   - Monitor: node test-multi-thread.js monitor 10');
      console.log('   - Stop: node test-multi-thread.js stop');
      console.log();

      // Start monitoring automatically
      console.log('📊 Monitoring for 2 minutes...\n');
      await monitorProgress(4); // 4 checks = 2 minutes

    } else {
      console.error('❌ Failed to start:', result.error || result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function monitorProgress(iterations) {
  for (let i = 0; i < iterations; i++) {
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds

    try {
      const result = await makeRequest('GET', '/api/extract/multi-thread/status');

      if (result.isRunning) {
        const runtime = Math.floor(result.runtime / 60000);
        const rate = (result.totalAds / Math.max(runtime, 1)).toFixed(1);

        console.log('\n📊 Status Update:');
        console.log('─'.repeat(60));
        console.log(`⏱️  Runtime: ${runtime} minutes`);
        console.log(`📦 Total Ads: ${result.totalAds}`);
        console.log(`⚡ Rate: ${rate} ads/min`);
        console.log(`👷 Active: ${result.activeWorkers}/${result.maxWorkers} workers`);

        if (result.workers && result.workers.length > 0) {
          console.log('\nPer Worker:');
          result.workers.forEach(w => {
            console.log(`   Worker #${w.workerId}: ${w.adsExtracted} ads (${w.status})`);
          });
        }
        console.log('─'.repeat(60));
      } else {
        console.log('\n⚠️  Extraction stopped\n');
        break;
      }
    } catch (error) {
      console.error('⚠️  Failed to get status:', error.message);
    }
  }

  console.log('\n✅ Monitoring complete. Workers still running in background.\n');
}

// Main
async function main() {
  const numWorkers = parseInt(process.argv[2]) || 5;
  const url = process.argv[3] || 'https://www.newsbreak.com/new-york-ny';

  if (numWorkers < 1 || numWorkers > 10) {
    console.error('❌ Number of workers must be between 1 and 10');
    process.exit(1);
  }

  if (!url.includes('newsbreak.com')) {
    console.error('❌ URL must be a valid NewsBreak URL');
    process.exit(1);
  }

  await launchSameUrlWorkers(numWorkers, url);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
