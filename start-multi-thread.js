#!/usr/bin/env node

/**
 * Quick start script for multi-threaded ad extraction
 *
 * Usage:
 *   node start-multi-thread.js                    # 5 workers, different URLs
 *   node start-multi-thread.js --workers 3        # 3 workers
 *   node start-multi-thread.js --same-url         # All workers on same URL
 *   node start-multi-thread.js --workers 10 --url "https://www.newsbreak.com/chicago-il"
 */

const MultiThreadExtractor = require('./src/services/multiThreadExtractor');

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  maxWorkers: 5,
  sameUrl: false,
  baseUrl: 'https://www.newsbreak.com/new-york-ny',
  deviceMode: 'desktop'
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--workers':
    case '-w':
      config.maxWorkers = parseInt(args[++i]) || 5;
      break;
    case '--same-url':
    case '-s':
      config.sameUrl = true;
      break;
    case '--url':
    case '-u':
      config.baseUrl = args[++i];
      break;
    case '--mobile':
    case '-m':
      config.deviceMode = 'mobile';
      break;
    case '--help':
    case '-h':
      console.log(`
Multi-Thread Ad Extractor - Quick Start

Usage:
  node start-multi-thread.js [options]

Options:
  --workers, -w <number>    Number of parallel workers (1-10, default: 5)
  --same-url, -s            All workers use the same URL (default: different URLs)
  --url, -u <url>           Base NewsBreak URL (default: New York)
  --mobile, -m              Use mobile device mode (default: desktop)
  --help, -h                Show this help message

Examples:
  node start-multi-thread.js
  node start-multi-thread.js --workers 3
  node start-multi-thread.js --same-url --url "https://www.newsbreak.com/chicago-il"
  node start-multi-thread.js -w 10 --mobile
      `);
      process.exit(0);
    default:
      console.log(`Unknown option: ${args[i]}`);
      console.log('Use --help for usage information');
      process.exit(1);
  }
}

// Validate workers
if (config.maxWorkers < 1 || config.maxWorkers > 10) {
  console.error('❌ Workers must be between 1 and 10');
  process.exit(1);
}

// Start extraction
async function start() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 MULTI-THREAD AD EXTRACTOR');
  console.log('='.repeat(70));
  console.log(`📊 Workers:      ${config.maxWorkers} parallel threads`);
  console.log(`🔗 Mode:         ${config.sameUrl ? 'SAME URL' : 'DIFFERENT URLs (city rotation)'}`);
  console.log(`📍 Base URL:     ${config.baseUrl}`);
  console.log(`📱 Device:       ${config.deviceMode}`);
  console.log(`⏱️  Duration:     Unlimited (continuous)`);
  console.log('='.repeat(70) + '\n');

  const extractor = new MultiThreadExtractor(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received SIGINT, stopping extraction...');
    await extractor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Received SIGTERM, stopping extraction...');
    await extractor.stop();
    process.exit(0);
  });

  try {
    await extractor.start();
    console.log('\n✅ Multi-thread extraction running!');
    console.log('💡 Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('❌ Failed to start multi-thread extraction:', error.message);
    process.exit(1);
  }
}

// Run
start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
