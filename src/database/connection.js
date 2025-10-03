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

      // Run migrations for existing databases
      await this.runMigrations();

      logger.info('Database initialized successfully');
      return true;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async initializeSchema() {
    try {
      // Check if schema file exists
      if (!await fs.exists(this.schemaPath)) {
        logger.warn(`Schema file not found at ${this.schemaPath}, creating tables directly`);
        await this.createTablesDirectly();
        return;
      }

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

      // Separate statements by type for proper execution order
      const tableStatements = [];
      const indexStatements = [];
      const triggerStatements = [];

      for (const statement of statements) {
        if (statement.trim() && !statement.startsWith('--')) {
          const upperStatement = statement.toUpperCase().trim();
          if (upperStatement.startsWith('CREATE TABLE')) {
            tableStatements.push(statement);
          } else if (upperStatement.startsWith('CREATE INDEX')) {
            indexStatements.push(statement);
          } else if (upperStatement.startsWith('CREATE TRIGGER')) {
            triggerStatements.push(statement);
          }
        }
      }

      // Execute in proper order: tables first, then indexes, then triggers
      logger.info('Creating database tables...');
      for (const statement of tableStatements) {
        try {
          await this.run(statement);
          logger.debug(`Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
          logger.error(`Failed to execute table statement: ${err.message}`);
          logger.error(`Statement: ${statement.substring(0, 100)}...`);
          throw err;
        }
      }

      // Verify tables exist before creating indexes
      await this.verifyTablesExist();

      logger.info('Creating database indexes...');
      for (const statement of indexStatements) {
        try {
          await this.run(statement);
          logger.debug(`Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
          logger.error(`Failed to execute index statement: ${err.message}`);
          logger.error(`Statement: ${statement.substring(0, 100)}...`);
          // Don't throw on index creation failure, continue
          logger.warn('Continuing despite index creation failure...');
        }
      }

      logger.info('Creating database triggers...');
      for (const statement of triggerStatements) {
        try {
          await this.run(statement);
          logger.debug(`Executed: ${statement.substring(0, 50)}...`);
        } catch (err) {
          logger.error(`Failed to execute trigger statement: ${err.message}`);
          logger.error(`Statement: ${statement.substring(0, 100)}...`);
          // Don't throw on trigger creation failure, continue
          logger.warn('Continuing despite trigger creation failure...');
        }
      }

      logger.info('Database schema initialized successfully');
    } catch (error) {
      logger.error('Schema initialization failed:', error);
      // Try fallback method
      logger.info('Attempting fallback table creation...');
      await this.createTablesDirectly();
    }
  }

  async verifyTablesExist() {
    try {
      const tables = await this.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'ads', 'ad_networks')"
      );
      const tableNames = tables.map(t => t.name);
      logger.info(`Verified tables exist: ${tableNames.join(', ')}`);

      if (!tableNames.includes('ads')) {
        logger.error('ads table does not exist, creating it now...');
        await this.createTablesDirectly();
      }
    } catch (error) {
      logger.error('Failed to verify tables:', error);
    }
  }

  async createTablesDirectly() {
    logger.info('Creating tables directly without schema file...');

    try {
      // Create sessions table
      await this.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT UNIQUE NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          total_ads INTEGER DEFAULT 0,
          url TEXT,
          duration TEXT,
          device_mode TEXT,
          status TEXT DEFAULT 'active',
          file_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Created sessions table');

      // Create ads table with UNIQUE constraint for multi-thread deduplication
      await this.run(`
        CREATE TABLE IF NOT EXISTS ads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          ad_id TEXT,
          heading TEXT,
          description TEXT,
          image_url TEXT,
          link_url TEXT,
          ad_network TEXT,
          timestamp DATETIME NOT NULL,
          element_html TEXT,
          position_x INTEGER,
          position_y INTEGER,
          width INTEGER,
          height INTEGER,
          viewport_width INTEGER,
          viewport_height INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ad_signature TEXT,
          FOREIGN KEY (session_id) REFERENCES sessions(session_id),
          UNIQUE(ad_signature)
        )
      `);
      logger.info('Created ads table');

      // Create ad_networks table
      await this.run(`
        CREATE TABLE IF NOT EXISTS ad_networks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          network_name TEXT UNIQUE NOT NULL,
          total_ads INTEGER DEFAULT 0,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Created ad_networks table');

      // Create indexes
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_ads_session_id ON ads(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_ads_timestamp ON ads(timestamp)',
        'CREATE INDEX IF NOT EXISTS idx_ads_ad_network ON ads(ad_network)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)'
      ];

      for (const indexSql of indexes) {
        try {
          await this.run(indexSql);
          logger.debug(`Created index: ${indexSql.substring(26)}`);
        } catch (err) {
          logger.warn(`Failed to create index: ${err.message}`);
        }
      }

      logger.info('Tables and indexes created successfully');
    } catch (error) {
      logger.error('Failed to create tables directly:', error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      logger.info('Running database migrations...');

      // Check if columns exist and add if missing
      const columnsToAdd = [
        { table: 'ads', name: 'ad_signature', type: 'TEXT' },
        { table: 'ads', name: 'ad_type', type: 'TEXT' },
        { table: 'ads', name: 'container_id', type: 'TEXT' }
      ];

      for (const column of columnsToAdd) {
        try {
          // Check if column exists
          const tableInfo = await this.all(`PRAGMA table_info(${column.table})`);
          const exists = tableInfo.some(col => col.name === column.name);

          if (!exists) {
            logger.info(`Adding column: ${column.table}.${column.name}`);
            await this.run(`ALTER TABLE ${column.table} ADD COLUMN ${column.name} ${column.type}`);
            logger.info(`✅ Added column: ${column.table}.${column.name}`);
          }
        } catch (err) {
          logger.warn(`Failed to add column ${column.name}: ${err.message}`);
        }
      }

      // Create index for ad_signature if it doesn't exist
      try {
        await this.run('CREATE INDEX IF NOT EXISTS idx_ads_ad_signature ON ads(ad_signature)');
        logger.info('✅ Created index: idx_ads_ad_signature');
      } catch (err) {
        logger.warn(`Failed to create index: ${err.message}`);
      }

      logger.info('Migrations completed successfully');
    } catch (error) {
      logger.warn('Migrations encountered errors:', error.message);
      // Don't throw - migrations are best-effort
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