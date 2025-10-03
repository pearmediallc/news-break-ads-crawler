#!/usr/bin/env node

/**
 * Database Migration Script
 * Adds ad_signature column and UNIQUE constraint for multi-thread deduplication
 *
 * Run this if you have an existing database before using multi-threading
 *
 * Usage: node migrate-database.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'data', 'ads_crawler.db');

console.log('\n' + '='.repeat(70));
console.log('🔄 DATABASE MIGRATION - Multi-Thread Deduplication');
console.log('='.repeat(70) + '\n');

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('❌ Database not found at:', dbPath);
  console.log('✅ No migration needed - new database will be created automatically');
  console.log('   with the correct schema when you start extraction.\n');
  process.exit(0);
}

console.log('📂 Database found:', dbPath);
console.log('🔍 Checking if migration is needed...\n');

const db = new sqlite3.Database(dbPath);

// Check if ad_signature column already exists
db.get("PRAGMA table_info(ads)", (err, rows) => {
  if (err) {
    console.error('❌ Error checking table structure:', err.message);
    db.close();
    process.exit(1);
  }
});

db.all("PRAGMA table_info(ads)", (err, rows) => {
  if (err) {
    console.error('❌ Error reading table info:', err.message);
    db.close();
    process.exit(1);
  }

  const hasSignature = rows.some(col => col.name === 'ad_signature');

  if (hasSignature) {
    console.log('✅ Database already has ad_signature column');
    console.log('✅ No migration needed!\n');
    db.close();
    process.exit(0);
  }

  console.log('📊 Current ads table structure:');
  rows.forEach(col => {
    console.log(`   - ${col.name} (${col.type})`);
  });

  console.log('\n⚠️  Migration needed: Adding ad_signature column\n');
  console.log('📝 Migration steps:');
  console.log('   1. Backup current database');
  console.log('   2. Create new table with ad_signature column');
  console.log('   3. Copy data from old table');
  console.log('   4. Generate signatures for existing ads');
  console.log('   5. Replace old table with new table\n');

  console.log('🚀 Starting migration...\n');

  // Backup database first
  const backupPath = dbPath + '.backup.' + Date.now();
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ Backup created: ${backupPath}\n`);
  } catch (err) {
    console.error('❌ Failed to create backup:', err.message);
    db.close();
    process.exit(1);
  }

  // Run migration in a transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('❌ Failed to start transaction:', err.message);
        db.close();
        process.exit(1);
      }

      // Step 1: Create new table with ad_signature
      const createTableSql = `
        CREATE TABLE ads_new (
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
      `;

      db.run(createTableSql, (err) => {
        if (err) {
          console.error('❌ Failed to create new table:', err.message);
          db.run('ROLLBACK');
          db.close();
          process.exit(1);
        }

        console.log('✅ Created new table with ad_signature column');

        // Step 2: Copy data and generate signatures
        const copySql = `
          INSERT INTO ads_new (
            id, session_id, ad_id, heading, description, image_url, link_url,
            ad_network, timestamp, element_html, position_x, position_y,
            width, height, viewport_width, viewport_height, created_at,
            ad_signature
          )
          SELECT
            id, session_id, ad_id, heading, description, image_url, link_url,
            ad_network, timestamp, element_html, position_x, position_y,
            width, height, viewport_width, viewport_height, created_at,
            lower(COALESCE(heading, '')) || '_' ||
            substr(lower(COALESCE(description, '')), 1, 200) || '_' ||
            lower(COALESCE(ad_network, '')) as ad_signature
          FROM ads
        `;

        db.run(copySql, (err) => {
          if (err) {
            console.error('❌ Failed to copy data:', err.message);
            db.run('ROLLBACK');
            db.close();
            process.exit(1);
          }

          console.log('✅ Copied data and generated ad signatures');

          // Step 3: Drop old table
          db.run('DROP TABLE ads', (err) => {
            if (err) {
              console.error('❌ Failed to drop old table:', err.message);
              db.run('ROLLBACK');
              db.close();
              process.exit(1);
            }

            console.log('✅ Removed old table');

            // Step 4: Rename new table
            db.run('ALTER TABLE ads_new RENAME TO ads', (err) => {
              if (err) {
                console.error('❌ Failed to rename table:', err.message);
                db.run('ROLLBACK');
                db.close();
                process.exit(1);
              }

              console.log('✅ Renamed new table to ads');

              // Step 5: Create indexes
              const indexSql = `
                CREATE INDEX IF NOT EXISTS idx_ads_session_id ON ads(session_id);
                CREATE INDEX IF NOT EXISTS idx_ads_timestamp ON ads(timestamp);
                CREATE INDEX IF NOT EXISTS idx_ads_ad_network ON ads(ad_network);
                CREATE INDEX IF NOT EXISTS idx_ads_signature ON ads(ad_signature);
              `;

              db.exec(indexSql, (err) => {
                if (err) {
                  console.error('❌ Failed to create indexes:', err.message);
                  db.run('ROLLBACK');
                  db.close();
                  process.exit(1);
                }

                console.log('✅ Created indexes');

                // Commit transaction
                db.run('COMMIT', (err) => {
                  if (err) {
                    console.error('❌ Failed to commit transaction:', err.message);
                    db.run('ROLLBACK');
                    db.close();
                    process.exit(1);
                  }

                  // Get stats
                  db.get('SELECT COUNT(*) as total FROM ads', (err, row) => {
                    if (err) {
                      console.error('❌ Failed to get stats:', err.message);
                    } else {
                      console.log(`\n✅ Migration complete! ${row.total} ads migrated successfully\n`);
                    }

                    console.log('🎉 Database is now ready for multi-threaded extraction!');
                    console.log('📌 Backup saved at:', backupPath);
                    console.log('💡 You can now run: npm run multi-thread\n');

                    db.close();
                    process.exit(0);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
