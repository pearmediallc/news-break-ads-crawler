// src/index.js
const NewsBreakCrawler = require('./crawlers/mainCrawler');
const logger = require('./utils/logger');
const chalk = require('chalk');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let duration = 60; // default 1 minute
  let sessionName = null;
  
  args.forEach((arg, index) => {
    if (arg === '--duration' && args[index + 1]) {
      duration = parseInt(args[index + 1]);
    }
    if (arg.startsWith('--duration=')) {
      duration = parseInt(arg.split('=')[1]);
    }
    if (arg === '--name' && args[index + 1]) {
      sessionName = args[index + 1];
    }
    if (arg.startsWith('--name=')) {
      sessionName = arg.split('=')[1];
    }
  });
  
  // Validation
  if (duration < 10 || duration > 3600) {
    console.error(chalk.red('❌ Duration must be between 10 seconds and 1 hour'));
    process.exit(1);
  }
  
  const crawler = new NewsBreakCrawler({
    duration,
    sessionName: sessionName || `newsbreak_crawl_${Date.now()}`
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⏹️  Stopping crawler...'));
    await crawler.cleanup();
    process.exit(0);
  });
  
  try {
    console.log(chalk.blue.bold('🕷️  NewsBreak Ads Crawler'));
    console.log(chalk.gray(`Duration: ${duration}s | Session: ${crawler.sessionName}`));
    console.log('');
    
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