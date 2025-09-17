const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Build transports array - always include console
const transports = [new winston.transports.Console()];

// Only add file transport in development or if explicitly enabled
const enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true' || process.env.NODE_ENV === 'development';

if (enableFileLogging) {
  try {
    // Try to create logs directory if it doesn't exist
    const logsDir = 'logs';
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Check if we can write to it
    fs.accessSync(logsDir, fs.constants.W_OK);

    // Add file transport
    transports.push(new winston.transports.File({
      filename: path.join('logs', 'crawler.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }));
    console.log('File logging enabled');
  } catch (error) {
    console.warn('Could not enable file logging:', error.message);
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level}]: ${stack || message}`;
    })
  ),
  transports: transports
});

module.exports = logger;