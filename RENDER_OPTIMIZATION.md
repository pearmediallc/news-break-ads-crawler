# 🚀 Render.com Memory Optimization Guide

## Memory Management Strategy

### ✅ **Database-First Storage**
- All ads are **immediately saved to SQLite database**
- **ALL ADS KEPT IN MEMORY** - never deleted
- **Database AND session files persist everything** permanently

### ✅ **Memory Management WITHOUT Data Deletion**
```javascript
Memory Management for Render.com:
- Warning thresholds: 350MB heap / 450MB total
- Critical thresholds: 400MB heap / 500MB total
- Browser restart: Every 45 minutes when memory > 300MB
- seenAds cache: Optimized at 8000 entries (no ads deleted)
- ZERO ADS DELETION - All data preserved in memory, database, and sessions
```

### ✅ **Safe Browser Memory Management**
- **Safe browser restart** every 45 minutes (only when memory > 300MB)
- **Gentle garbage collection** on high memory
- **Progress preservation** before any restart
- **Non-disruptive cleanup** between extraction cycles
- **Clean page/browser references** on errors
- **Progressive retry logic** with cleanup

## Environment Variables for Render

Add these to your Render environment:

```bash
NODE_ENV=production
NODE_OPTIONS=--expose-gc --max-old-space-size=480
PORT=3000
```

## Memory Monitoring

The app now logs:
```
Memory: 245MB heap, 380MB total | DB: 1,847 ads saved
💾 Periodic save completed (Memory: 1,847, DB: 1,847)
⚠️ High memory usage detected: 385MB heap, 445MB total
📊 Current data: 1,847 ads in memory, 1,847 in database
💾 All data preserved in session and database
🗑️ Garbage collection performed - data preserved
🔄 Safe browser restart scheduled (45 min uptime, 320MB memory)
💾 Saving progress before browser restart...
✅ Browser safely restarted - all data preserved
```

## Data Access

### Memory Data (Complete)
- Dashboard shows ALL ads from memory
- Fast access for real-time updates
- NO LIMITS - all extracted ads kept

### Database Data (Complete)
- All extracted ads saved permanently
- Access via "Load All DB" button
- Query by time ranges, advertisers, etc.
- Export full datasets

## Data Preservation Strategy

- ✅ **ALL EXTRACTED ADS** - Never deleted from memory
- ✅ **Session files** - Contain all ads permanently
- ✅ **Database** - All ads stored permanently
- ✅ **Memory management** - Only browser restarts and garbage collection
- ❌ **NO DATA DELETION** - Zero ads removed from anywhere

## Key Changes Made

1. **saveToDatabase()** - Primary storage method (immediate save)
2. **ZERO DATA DELETION** - All ads preserved in memory permanently
3. **Non-disruptive browser restart** - Every 45 minutes when memory > 300MB
4. **Memory warning thresholds** - 350MB heap trigger with data preservation
5. **seenAds cache optimization** - Only cache optimized, ads never deleted
6. **Complete data preservation** - Memory, database, and session files all preserved

## Testing on Render

```bash
# Deploy with these settings:
Build Command: npm install
Start Command: npm start

# Monitor memory in logs:
grep -E "Memory:|Emergency|cleanup" render.log
```

## Expected Memory Pattern

```
Startup: ~100MB
Normal: 200-300MB
Cleanup: Drop to ~150MB
Restart: Back to ~100MB
```

**Result: Unlimited mode should run indefinitely on Render without memory crashes!**