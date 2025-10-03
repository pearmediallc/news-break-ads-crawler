#!/usr/bin/env node

/**
 * Database Backup Script
 * Creates timestamped backups of the database
 *
 * Usage:
 *   node backup-database.js           # Create backup
 *   node backup-database.js --auto    # Auto backup (for cron jobs)
 *   node backup-database.js --list    # List all backups
 */

const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'ads_crawler.db');
const backupDir = path.join(process.cwd(), 'data', 'backups');
const args = process.argv.slice(2);

// Ensure backup directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// List backups
if (args.includes('--list')) {
  console.log('\n📦 Available Database Backups:\n');

  if (!fs.existsSync(backupDir)) {
    console.log('No backups found.\n');
    process.exit(0);
  }

  const backups = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log('No backups found.\n');
    process.exit(0);
  }

  backups.forEach((backup, index) => {
    const stats = fs.statSync(path.join(backupDir, backup));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const date = backup.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/)[0];
    console.log(`${index + 1}. ${backup}`);
    console.log(`   Date: ${date.replace('_', ' at ').replace(/-/g, ':')}`);
    console.log(`   Size: ${sizeMB} MB`);
    console.log('');
  });

  process.exit(0);
}

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('❌ Database not found at:', dbPath);
  console.log('💡 Database will be created when you run extraction.\n');
  process.exit(1);
}

// Create backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const backupFile = `ads_crawler_backup_${timestamp}.db`;
const backupPath = path.join(backupDir, backupFile);

const autoMode = args.includes('--auto');

if (!autoMode) {
  console.log('\n' + '='.repeat(70));
  console.log('💾 DATABASE BACKUP');
  console.log('='.repeat(70));
  console.log(`\n📂 Source:      ${dbPath}`);
  console.log(`📦 Destination: ${backupPath}`);
}

try {
  // Get database stats
  const stats = fs.statSync(dbPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  if (!autoMode) {
    console.log(`📊 Size:        ${sizeMB} MB`);
    console.log('\n🔄 Creating backup...');
  }

  // Copy database file
  fs.copyFileSync(dbPath, backupPath);

  if (!autoMode) {
    console.log('✅ Backup created successfully!\n');
    console.log(`📌 Backup location: ${backupPath}\n`);
  } else {
    console.log(`✅ Auto backup created: ${backupFile} (${sizeMB} MB)`);
  }

  // Clean up old backups (keep last 30)
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('ads_crawler_backup_') && f.endsWith('.db'))
    .sort()
    .reverse();

  if (backups.length > 30) {
    const toDelete = backups.slice(30);
    if (!autoMode) {
      console.log(`🧹 Cleaning up ${toDelete.length} old backups...\n`);
    }
    toDelete.forEach(backup => {
      fs.unlinkSync(path.join(backupDir, backup));
    });
  }

  if (!autoMode) {
    console.log('💡 To restore a backup:');
    console.log('   cp data/backups/[backup-file].db data/ads_crawler.db\n');
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
