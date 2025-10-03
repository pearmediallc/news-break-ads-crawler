#!/usr/bin/env node

/**
 * Database Restore Script
 * Restores database from a backup
 *
 * Usage:
 *   node restore-database.js                    # Interactive mode
 *   node restore-database.js [backup-file]      # Restore specific backup
 *   node restore-database.js --latest           # Restore latest backup
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const dbPath = path.join(process.cwd(), 'data', 'ads_crawler.db');
const backupDir = path.join(process.cwd(), 'data', 'backups');
const args = process.argv.slice(2);

// Get available backups
function getBackups() {
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('ads_crawler_backup_') && f.endsWith('.db'))
    .sort()
    .reverse();
}

const backups = getBackups();

if (backups.length === 0) {
  console.error('❌ No backups found in:', backupDir);
  console.log('💡 Create a backup first: npm run backup-db\n');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('📦 DATABASE RESTORE');
console.log('='.repeat(70) + '\n');

// Handle --latest flag
if (args.includes('--latest')) {
  const latestBackup = backups[0];
  restoreBackup(latestBackup);
  process.exit(0);
}

// Handle specific backup file
if (args.length > 0 && !args[0].startsWith('--')) {
  const backupFile = args[0];
  if (!backups.includes(backupFile)) {
    console.error(`❌ Backup not found: ${backupFile}`);
    console.log('\n📦 Available backups:');
    backups.forEach((b, i) => console.log(`   ${i + 1}. ${b}`));
    console.log('');
    process.exit(1);
  }
  restoreBackup(backupFile);
  process.exit(0);
}

// Interactive mode
console.log('📦 Available backups:\n');
backups.forEach((backup, index) => {
  const stats = fs.statSync(path.join(backupDir, backup));
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const date = backup.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/)[0];
  console.log(`${index + 1}. ${backup}`);
  console.log(`   Date: ${date.replace('_', ' at ').replace(/-/g, ':')}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log('');
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter backup number to restore (or "q" to quit): ', (answer) => {
  rl.close();

  if (answer.toLowerCase() === 'q') {
    console.log('Cancelled.\n');
    process.exit(0);
  }

  const index = parseInt(answer) - 1;
  if (isNaN(index) || index < 0 || index >= backups.length) {
    console.error('❌ Invalid selection\n');
    process.exit(1);
  }

  const selectedBackup = backups[index];
  restoreBackup(selectedBackup);
});

function restoreBackup(backupFile) {
  const backupPath = path.join(backupDir, backupFile);

  console.log(`\n📂 Restoring from: ${backupFile}`);

  // Backup current database first
  if (fs.existsSync(dbPath)) {
    const currentBackup = dbPath + '.before-restore.' + Date.now();
    console.log(`💾 Backing up current database to: ${path.basename(currentBackup)}`);
    fs.copyFileSync(dbPath, currentBackup);
  }

  try {
    // Restore
    console.log('🔄 Restoring database...');
    fs.copyFileSync(backupPath, dbPath);

    const stats = fs.statSync(dbPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log('✅ Database restored successfully!');
    console.log(`📊 Restored size: ${sizeMB} MB\n`);

    // Quick verification
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('⚠️  Warning: Could not verify database:', err.message);
        process.exit(0);
      }

      db.get('SELECT COUNT(*) as total FROM ads', (err, row) => {
        if (err) {
          console.error('⚠️  Warning: Could not count ads:', err.message);
        } else {
          console.log(`✅ Verification: ${row.total} ads in database`);
        }

        db.get('SELECT COUNT(*) as total FROM sessions', (err, row) => {
          if (err) {
            console.error('⚠️  Warning: Could not count sessions:', err.message);
          } else {
            console.log(`✅ Verification: ${row.total} sessions in database\n`);
          }

          db.close();
          process.exit(0);
        });
      });
    });
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    process.exit(1);
  }
}
