// src/utils/timeController.js
const chalk = require('chalk');
const logger = require('./logger');

class TimeController {
  constructor(config = {}) {
    this.duration = this.parseDuration(config.duration);
    this.startTime = null;
    this.endTime = null;
    this.isRunning = false;
    this.checkInterval = null;
    this.onComplete = config.onComplete || (() => {});
    this.mode = config.mode || 'duration'; // 'duration', 'unlimited', 'scheduled'
    this.scheduleEnd = config.scheduleEnd || null;
  }

  parseDuration(input) {
    if (!input) return null;

    // Handle different time formats
    if (typeof input === 'number') {
      return input * 1000; // Convert seconds to milliseconds
    }

    if (typeof input === 'string') {
      const units = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
      };

      // Parse format like "2h", "30m", "1d", "9h30m"
      const regex = /(\d+)([smhd])/g;
      let totalMs = 0;
      let match;

      while ((match = regex.exec(input)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        totalMs += value * units[unit];
      }

      // If no units specified, assume seconds
      if (totalMs === 0 && /^\d+$/.test(input)) {
        totalMs = parseInt(input) * 1000;
      }

      return totalMs || null;
    }

    return null;
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms % (60 * 1000)) / 1000);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  start() {
    this.startTime = Date.now();
    this.isRunning = true;

    if (this.mode === 'unlimited') {
      console.log(chalk.green('🔄 Starting unlimited crawler session'));
      console.log(chalk.gray('Press Ctrl+C to stop at any time'));

      // Start progress logger for unlimited mode
      this.checkInterval = setInterval(() => {
        const elapsed = Date.now() - this.startTime;
        console.log(chalk.cyan(`⏱️  Running for: ${this.formatDuration(elapsed)}`));
      }, 60000); // Log every minute

    } else if (this.mode === 'scheduled') {
      this.endTime = this.scheduleEnd;
      const duration = this.endTime - this.startTime;
      console.log(chalk.green(`⏰ Scheduled run until: ${new Date(this.endTime).toLocaleString()}`));
      console.log(chalk.gray(`Total duration: ${this.formatDuration(duration)}`));

      this.setupDurationCheck();

    } else if (this.mode === 'duration' && this.duration) {
      this.endTime = this.startTime + this.duration;
      console.log(chalk.green(`⏱️  Starting ${this.formatDuration(this.duration)} crawler session`));

      this.setupDurationCheck();
    }

    logger.info(`Time controller started in ${this.mode} mode`);
  }

  setupDurationCheck() {
    // Check every 10 seconds if we should stop
    this.checkInterval = setInterval(() => {
      if (this.shouldStop()) {
        this.stop();
      } else {
        const remaining = this.getRemainingTime();
        if (remaining && remaining < 60000) { // Less than 1 minute
          console.log(chalk.yellow(`⚠️  ${Math.ceil(remaining / 1000)} seconds remaining`));
        }
      }
    }, 10000);
  }

  shouldStop() {
    if (!this.isRunning) return true;
    if (this.mode === 'unlimited') return false;
    if (this.endTime && Date.now() >= this.endTime) return true;
    return false;
  }

  getRemainingTime() {
    if (this.mode === 'unlimited') return null;
    if (!this.endTime) return null;
    const remaining = this.endTime - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  getElapsedTime() {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  stop() {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    const elapsed = this.getElapsedTime();
    console.log(chalk.blue(`✅ Session completed after ${this.formatDuration(elapsed)}`));
    logger.info(`Time controller stopped. Total duration: ${this.formatDuration(elapsed)}`);

    this.onComplete();
  }

  // Get status for display
  getStatus() {
    if (!this.isRunning) {
      return { status: 'stopped', elapsed: 0, remaining: null };
    }

    const elapsed = this.getElapsedTime();
    const remaining = this.getRemainingTime();

    return {
      status: this.mode,
      elapsed: this.formatDuration(elapsed),
      remaining: remaining ? this.formatDuration(remaining) : 'unlimited',
      shouldStop: this.shouldStop()
    };
  }
}

// Factory function for easy creation
function createTimeController(input) {
  // Handle different input formats
  if (input === 'unlimited' || input === null || input === 0) {
    return new TimeController({ mode: 'unlimited' });
  }

  if (typeof input === 'object' && input.until) {
    // Scheduled mode - run until specific time
    const endTime = new Date(input.until).getTime();
    return new TimeController({
      mode: 'scheduled',
      scheduleEnd: endTime
    });
  }

  // Duration mode
  return new TimeController({
    mode: 'duration',
    duration: input
  });
}

module.exports = { TimeController, createTimeController };