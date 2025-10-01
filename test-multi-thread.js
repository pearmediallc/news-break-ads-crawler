#!/usr/bin/env node

/**
 * Test script for multi-thread extraction
 *
 * Usage:
 *   node test-multi-thread.js start 3        # Start with 3 workers
 *   node test-multi-thread.js status          # Get current status
 *   node test-multi-thread.js stop            # Stop extraction
 *   node test-multi-thread.js monitor         # Monitor for 5 minutes
 */

const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TOKEN = process.env.AUTH_TOKEN || ''; // Set if auth required

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (TOKEN) {
      options.headers['Cookie'] = `token=${TOKEN}`;
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          resolve({ error: 'Invalid JSON response', data });
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

async function startExtraction(workers = 3) {
  console.log(`\n🚀 Starting multi-thread extraction with ${workers} workers...\n`);

  try {
    const result = await makeRequest('POST', '/api/extract/multi-thread/start', {
      maxWorkers: workers,
      deviceMode: 'desktop'
    });

    if (result.success) {
      console.log('✅ Started successfully!');
      console.log(`📊 Status:`, JSON.stringify(result.status, null, 2));
    } else {
      console.error('❌ Failed to start:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function getStatus() {
  try {
    const result = await makeRequest('GET', '/api/extract/multi-thread/status');

    if (result.isRunning) {
      const runtime = Math.floor(result.runtime / 60000);
      const rate = (result.totalAds / Math.max(runtime, 1)).toFixed(1);

      console.log('\n📊 MULTI-THREAD EXTRACTION STATUS');
      console.log('─'.repeat(60));
      console.log(`⏱️  Runtime: ${runtime} minutes`);
      console.log(`👷 Active Workers: ${result.activeWorkers}/${result.maxWorkers}`);
      console.log(`📦 Total Ads: ${result.totalAds}`);
      console.log(`⚡ Rate: ${rate} ads/min`);
      console.log('─'.repeat(60));

      if (result.workers && result.workers.length > 0) {
        console.log('\nWorker Details:');
        result.workers.forEach(w => {
          const uptime = Math.floor(w.uptime / 60000);
          console.log(`  Worker #${w.workerId}: ${w.adsExtracted} ads, ${uptime}m uptime, ${w.status}`);
          console.log(`    URL: ${w.url}`);
        });
      }
      console.log();
    } else {
      console.log('\n⚠️  No multi-thread extraction running\n');
    }

    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function stopExtraction() {
  console.log('\n🛑 Stopping multi-thread extraction...\n');

  try {
    const result = await makeRequest('POST', '/api/extract/multi-thread/stop');

    if (result.success) {
      console.log('✅ Stopped successfully!');
      if (result.finalStats) {
        const runtime = Math.floor(result.finalStats.runtime / 60000);
        console.log(`\n📊 Final Stats:`);
        console.log(`   Runtime: ${runtime} minutes`);
        console.log(`   Total Ads: ${result.finalStats.totalAds}`);
      }
    } else {
      console.error('❌ Failed to stop:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log();
}

async function monitorExtraction(durationMinutes = 5) {
  console.log(`\n👁️  Monitoring multi-thread extraction for ${durationMinutes} minutes...\n`);

  const interval = 10000; // 10 seconds
  const iterations = (durationMinutes * 60 * 1000) / interval;

  for (let i = 0; i < iterations; i++) {
    await getStatus();
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.log('✅ Monitoring complete\n');
}

async function getLogs(workerId = null) {
  try {
    const path = workerId
      ? `/api/extract/multi-thread/logs?workerId=${workerId}&limit=20`
      : '/api/extract/multi-thread/logs?limit=50';

    const result = await makeRequest('GET', path);

    if (result.success) {
      console.log(`\n📋 Recent Logs (${result.count} entries):\n`);

      result.logs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const workerLabel = log.workerId ? `[Worker #${log.workerId}]` : '';
        console.log(`[${timestamp}] ${workerLabel} ${log.level.toUpperCase()}: ${log.message}`);
      });

      console.log();
    } else {
      console.error('❌ Failed to get logs:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Main
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'start':
      await startExtraction(parseInt(arg) || 3);
      break;

    case 'status':
      await getStatus();
      break;

    case 'stop':
      await stopExtraction();
      break;

    case 'monitor':
      await monitorExtraction(parseInt(arg) || 5);
      break;

    case 'logs':
      await getLogs(arg ? parseInt(arg) : null);
      break;

    default:
      console.log('\n📖 Multi-Thread Extraction Test Script\n');
      console.log('Usage:');
      console.log('  node test-multi-thread.js start [workers]  # Start with N workers (default: 3)');
      console.log('  node test-multi-thread.js status            # Get current status');
      console.log('  node test-multi-thread.js stop              # Stop extraction');
      console.log('  node test-multi-thread.js monitor [mins]    # Monitor for N minutes (default: 5)');
      console.log('  node test-multi-thread.js logs [workerId]   # View logs (optionally for specific worker)');
      console.log('\nExamples:');
      console.log('  node test-multi-thread.js start 5           # Start with 5 workers');
      console.log('  node test-multi-thread.js monitor 10        # Monitor for 10 minutes');
      console.log('  node test-multi-thread.js logs 1            # Get logs from worker 1');
      console.log('\nEnvironment Variables:');
      console.log('  API_URL=http://localhost:3000              # Server URL');
      console.log('  AUTH_TOKEN=your_jwt_token                  # Auth token if required');
      console.log();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
