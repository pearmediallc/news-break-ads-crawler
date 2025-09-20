const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor() {
    this.db = null;
    this.dbPath = path.join(process.cwd(), 'data', 'ads_crawler.db');
    this.schemaPath = path.join(__dirname, 'schema.sql');
  }

  async initialize() {
    try {
      // Ensure data directory exists
      await fs.ensureDir(path.dirname(this.dbPath));

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Database connection failed:', err);
          throw err;
        }
        logger.info(`Connected to SQLite database: ${this.dbPath}`);
      });

      // Enable foreign keys
      await this.run('PRAGMA foreign_keys = ON');

      // Initialize schema
      await this.initializeSchema();

      logger.info('Database initialized successfully');
      return true;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async initializeSchema() {
    try {
      const schema = await fs.readFile(this.schemaPath, 'utf8');

      // Split by semicolon but handle multi-line statements (triggers)
      const statements = [];
      let currentStatement = '';
      let inTrigger = false;

      const lines = schema.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('CREATE TRIGGER')) {
          inTrigger = true;
        }

        currentStatement += line + '\n';

        if (trimmedLine.endsWith(';')) {
          if (inTrigger && trimmedLine === 'END;') {
            inTrigger = false;
          }

          if (!inTrigger) {
            statements.push(currentStatement.trim());
            currentStatement = '';
          }
        }
      }

      for (const statement of statements) {
        if (statement.trim() && !statement.startsWith('--')) {
          await this.run(statement);
        }
      }

      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Schema initialization failed:', error);
      throw error;
    }
  }

  // Promisify database operations
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            logger.info('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // Helper method to check if database is connected
  isConnected() {
    return this.db !== null;
  }
}

module.exports = DatabaseConnection;