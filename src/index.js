// src/index.js
const NewsBreakCrawler = require('./crawlers/mainCrawler');
const logger = require('./utils/logger');
const chalk = require('chalk');
const { createTimeController } = require('./utils/timeController');

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let duration = '60s'; // default 1 minute
  let sessionName = null;
  let unlimited = false;

  args.forEach((arg, index) => {
    if (arg === '--duration' && args[index + 1]) {
      duration = args[index + 1];
    }
    if (arg.startsWith('--duration=')) {
      duration = arg.split('=')[1];
    }
    if (arg === '--unlimited' || arg === '-u') {
      unlimited = true;
    }
    if (arg === '--name' && args[index + 1]) {
      sessionName = args[index + 1];
    }
    if (arg.startsWith('--name=')) {
      sessionName = arg.split('=')[1];
    }
  });

  // Create time controller with no restrictions
  const timeController = createTimeController(unlimited ? 'unlimited' : duration);

  // Show usage examples if invalid duration
  if (!unlimited && !timeController.duration) {
    console.log(chalk.yellow('📋 Usage examples:'));
    console.log(chalk.gray('  npm start --duration 30s     (30 seconds)'));
    console.log(chalk.gray('  npm start --duration 5m      (5 minutes)'));
    console.log(chalk.gray('  npm start --duration 2h      (2 hours)'));
    console.log(chalk.gray('  npm start --duration 9h      (9 hours)'));
    console.log(chalk.gray('  npm start --duration 1d      (1 day)'));
    console.log(chalk.gray('  npm start --duration 9h30m   (9 hours 30 minutes)'));
    console.log(chalk.gray('  npm start --unlimited         (run indefinitely)'));
    process.exit(1);
  }
  
  const crawler = new NewsBreakCrawler({
    timeController: timeController,
    sessionName: sessionName || `newsbreak_crawl_${Date.now()}`
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⏹️  Stopping crawler...'));
    timeController.stop();
    await crawler.cleanup();
    process.exit(0);
  });

  try {
    console.log(chalk.blue.bold('🕷️  NewsBreak Ads Crawler'));
    const status = timeController.getStatus();
    console.log(chalk.gray(`Mode: ${unlimited ? 'UNLIMITED' : status.status} | Session: ${crawler.sessionName}`));
    if (!unlimited) {
      console.log(chalk.gray(`Duration: ${timeController.formatDuration(timeController.duration)}`));
    }
    console.log('');

    // Start time controller
    timeController.start();

    await crawler.initialize();
    const results = await crawler.startCrawling();
    
    console.log('');
    console.log(chalk.green.bold('🎉 Crawling completed successfully!'));
    console.log(chalk.cyan(`📊 Session ID: ${results.sessionId}`));
    console.log(chalk.cyan(`📊 Total ads: ${results.totalAds}`));
    console.log(chalk.cyan(`🎬 Media files: ${results.totalMedia}`));
    console.log(chalk.cyan(`📸 Screenshots: ${results.screenshots}`));
    console.log(chalk.cyan(`⏱️  Duration: ${results.actualDuration}s`));
    
    if (results.downloadErrors > 0) {
      console.log(chalk.yellow(`⚠️  Download errors: ${results.downloadErrors}`));
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Crawling failed: ${error.message}`));
    logger.error('Main process failed:', error);
  } finally {
    await crawler.cleanup();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { NewsBreakCrawler };