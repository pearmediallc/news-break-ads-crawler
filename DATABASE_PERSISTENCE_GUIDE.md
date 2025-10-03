# 📦 Database Persistence Guide

## Problem Fixed

**Before:** Database was being lost on every deployment/code push because `data/` directory was in `.gitignore`.

**After:** Database is now **persistent**, **version-controlled**, and **backed up automatically**.

---

## 🛡️ What's Been Fixed

### 1. **Git Configuration** ✅

**Updated [.gitignore](.gitignore):**
```gitignore
# BEFORE (Lost database on every push)
data/

# AFTER (Database persists)
data/sessions/*.json      # Ignore temp session files
data/*.json               # Ignore temp JSON files
data/*.log                # Ignore log files
data/backups/             # Ignore backups (too large)
!data/.gitkeep            # Keep data directory structure
!data/sessions/.gitkeep   # Keep sessions directory structure
# DO NOT ignore *.db files - database must be committed
```

**Result:**
- ✅ `data/ads_crawler.db` **IS** committed to git
- ✅ `data/users.db` **IS** committed to git
- ❌ Temp files **ARE NOT** committed (sessions, logs)
- ❌ Backups **ARE NOT** committed (too large)

### 2. **Directory Structure Protection** ✅

Created `.gitkeep` files:
- `data/.gitkeep` - Ensures data directory exists in repo
- `data/sessions/.gitkeep` - Ensures sessions directory exists

### 3. **Database Schema** ✅

Updated to use `CREATE TABLE IF NOT EXISTS`:
- Will **never** drop existing tables
- Will **never** overwrite existing data
- Only creates tables if they don't exist

### 4. **Backup System** ✅

Added automatic backup scripts:
- `backup-database.js` - Create database backups
- `restore-database.js` - Restore from backups
- Keeps last 30 backups automatically
- Excluded from git (stored locally only)

---

## 📊 What's Saved Where

| File | Saved in Git? | Purpose | Persistence |
|------|---------------|---------|-------------|
| `data/ads_crawler.db` | ✅ **YES** | Main ad database | **Permanent** |
| `data/users.db` | ✅ **YES** | User accounts | **Permanent** |
| `data/sessions/*.json` | ❌ No | Temp session files | Temporary |
| `data/*.json` | ❌ No | Temp status files | Temporary |
| `data/backups/*.db` | ❌ No | Local backups | Local only |

---

## 🔄 Deployment Workflow

### **Before (Data Lost):**
```bash
git add .
git commit -m "new code"
git push
# ❌ Database lost!
```

### **After (Data Persists):**
```bash
# 1. Backup first (recommended)
npm run backup-db

# 2. Commit code AND database
git add .
git commit -m "new code + database"
git push

# ✅ Database pushed with code!
```

---

## 💾 Backup Commands

### **Create Backup**
```bash
# Interactive backup
npm run backup-db

# Auto backup (for cron jobs)
npm run backup-db:auto

# List all backups
npm run backup-db:list
```

### **Restore Backup**
```bash
# Interactive restore (choose from list)
npm run restore-db

# Restore latest backup
npm run restore-db:latest

# Restore specific backup
node restore-database.js ads_crawler_backup_2025-10-03_15-30-00.db
```

---

## 🚀 Best Practices

### **1. Backup Before Major Changes**
```bash
# Before multi-thread extraction
npm run backup-db
npm run multi-thread:5

# Before database migration
npm run backup-db
npm run migrate-db
```

### **2. Regular Scheduled Backups**

**Windows (Task Scheduler):**
```bash
# Run daily at 2 AM
schtasks /create /tn "DB Backup" /tr "node C:\path\to\backup-database.js --auto" /sc daily /st 02:00
```

**Linux/Mac (Cron):**
```bash
# Add to crontab (daily at 2 AM)
0 2 * * * cd /path/to/app && npm run backup-db:auto
```

### **3. Commit Database Regularly**
```bash
# After significant data collection
npm run backup-db
git add data/ads_crawler.db
git commit -m "Update database: +1000 ads"
git push
```

---

## 🔍 Verify Database Persistence

### **Check if Database is Tracked:**
```bash
git ls-files data/
# Should show: data/.gitkeep, data/ads_crawler.db, etc.
```

### **Check Database Size:**
```bash
ls -lh data/*.db
# ads_crawler.db - should show file size (not 0 bytes)
```

### **Query Database:**
```bash
sqlite3 data/ads_crawler.db "SELECT COUNT(*) FROM ads"
# Should return ad count (not error)
```

---

## 🛠️ Troubleshooting

### **Problem: Database Still Being Lost**

**Check 1: Is database in git?**
```bash
git ls-files | grep ads_crawler.db
# Should return: data/ads_crawler.db
```

**Fix if not tracked:**
```bash
git add data/ads_crawler.db --force
git commit -m "Add database to version control"
git push
```

**Check 2: Is .gitignore correct?**
```bash
cat .gitignore | grep -A 5 "data/"
# Should NOT have "data/" alone
# Should have specific patterns like "data/*.json"
```

**Check 3: Is database actually there?**
```bash
ls -la data/ads_crawler.db
# Should show file with size > 0
```

### **Problem: Database Corrupted**

**Restore from backup:**
```bash
npm run restore-db:latest
```

**Or restore from git:**
```bash
git checkout HEAD -- data/ads_crawler.db
```

### **Problem: Old Database After Deployment**

**Pull latest database:**
```bash
git pull origin main
# Database should update automatically
```

**Force pull if needed:**
```bash
git fetch origin
git reset --hard origin/main
```

---

## 📈 Database Size Management

### **Check Database Size:**
```bash
sqlite3 data/ads_crawler.db "SELECT
  (SELECT COUNT(*) FROM ads) as total_ads,
  (SELECT COUNT(*) FROM sessions) as total_sessions,
  (SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()) / 1024 / 1024 as size_mb
"
```

### **Vacuum Database (Compact):**
```bash
sqlite3 data/ads_crawler.db "VACUUM"
```

### **Archive Old Data:**
```bash
# Export old ads
sqlite3 data/ads_crawler.db ".mode csv" ".output archive.csv" "SELECT * FROM ads WHERE timestamp < '2025-01-01'"

# Delete old ads
sqlite3 data/ads_crawler.db "DELETE FROM ads WHERE timestamp < '2025-01-01'"

# Compact
sqlite3 data/ads_crawler.db "VACUUM"
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| **Backup database** | `npm run backup-db` |
| **List backups** | `npm run backup-db:list` |
| **Restore latest** | `npm run restore-db:latest` |
| **Check git status** | `git ls-files data/` |
| **View database** | `sqlite3 data/ads_crawler.db` |
| **Count ads** | `sqlite3 data/ads_crawler.db "SELECT COUNT(*) FROM ads"` |
| **Commit database** | `git add data/ads_crawler.db && git commit -m "Update DB"` |

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Database file exists: `ls -la data/ads_crawler.db`
- [ ] Database is not empty: `sqlite3 data/ads_crawler.db "SELECT COUNT(*) FROM ads"`
- [ ] Database is in git: `git ls-files | grep ads_crawler.db`
- [ ] Backup created: `ls -la data/backups/`
- [ ] Sessions directory exists: `ls -la data/sessions/`
- [ ] App can connect: Check logs for database errors

---

## 🎉 Summary

Your database is now:

✅ **Persistent** - Survives deployments
✅ **Version-controlled** - Committed to git
✅ **Backed up** - Automatic backup system
✅ **Recoverable** - Easy restore from backups
✅ **Protected** - No accidental overwrites
✅ **Tracked** - Clear separation of persistent vs temporary data

**No more data loss on deployment!** 🚀
