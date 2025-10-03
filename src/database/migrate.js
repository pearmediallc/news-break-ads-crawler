// Database migration script to add missing columns
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

async function migrateDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'ads_crawler.db');

  console.log('🔄 Starting database migration...');
  console.log(`📁 Database: ${dbPath}`);

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('❌ Failed to open database:', err);
        reject(err);
        return;
      }

      console.log('✅ Database connection established');

      try {
        // Check if ad_signature column exists
        const checkColumn = (tableName, columnName) => {
          return new Promise((res, rej) => {
            db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
              if (err) {
                rej(err);
                return;
              }
              const exists = columns.some(col => col.name === columnName);
              res(exists);
            });
          });
        };

        // Add missing columns to ads table
        const columnsToAdd = [
          { name: 'ad_signature', type: 'TEXT' },
          { name: 'ad_type', type: 'TEXT' },
          { name: 'container_id', type: 'TEXT' }
        ];

        for (const column of columnsToAdd) {
          const exists = await checkColumn('ads', column.name);
          if (!exists) {
            await new Promise((res, rej) => {
              console.log(`➕ Adding column: ${column.name}`);
              db.run(`ALTER TABLE ads ADD COLUMN ${column.name} ${column.type}`, (err) => {
                if (err) {
                  console.error(`❌ Failed to add ${column.name}:`, err.message);
                  rej(err);
                } else {
                  console.log(`✅ Added column: ${column.name}`);
                  res();
                }
              });
            });
          } else {
            console.log(`✓ Column ${column.name} already exists`);
          }
        }

        // Create index for ad_signature if it doesn't exist
        await new Promise((res, rej) => {
          console.log('➕ Creating index: idx_ads_ad_signature');
          db.run('CREATE INDEX IF NOT EXISTS idx_ads_ad_signature ON ads(ad_signature)', (err) => {
            if (err) {
              console.error('❌ Failed to create index:', err.message);
              rej(err);
            } else {
              console.log('✅ Index created successfully');
              res();
            }
          });
        });

        console.log('✅ Migration completed successfully!');
        db.close();
        resolve();

      } catch (error) {
        console.error('❌ Migration failed:', error);
        db.close();
        reject(error);
      }
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('🎉 Database migration successful');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateDatabase;
