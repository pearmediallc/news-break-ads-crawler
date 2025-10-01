# Same-URL Multi-Worker Extraction

## Overview
Launch **multiple workers on the SAME URL** to extract more ads from a single location.

## Why Same-URL Workers?

**Problem**: Single worker on NYC gets only 30-50 ads, then gets stuck
**Solution**: 5 workers on NYC = 5x parallel extraction = 150-250 ads from same location

### How It Works

```
Single Worker (Old):
┌──────────────┐
│  1 Browser   │ → NYC → Finds 40 ads → Gets stuck
└──────────────┘

Same-URL Multi-Workers (New):
┌──────────────┐
│  Worker #1   │ → NYC (Browser 1) → Finds 35 ads
├──────────────┤
│  Worker #2   │ → NYC (Browser 2) → Finds 32 ads
├──────────────┤
│  Worker #3   │ → NYC (Browser 3) → Finds 38 ads
├──────────────┤
│  Worker #4   │ → NYC (Browser 4) → Finds 30 ads
├──────────────┤
│  Worker #5   │ → NYC (Browser 5) → Finds 40 ads
└──────────────┘
    ↓
Total: 175 ads from NYC (5x more!)
```

**Why this works:**
- Each browser gets served different ads by NewsBreak
- Ad networks show different ads per "user" (browser session)
- Database automatically deduplicates any overlaps
- 5 parallel scrollers cover more content faster

---

## Quick Launch

### Option 1: Via Launch Script (Easiest)

```bash
# Launch 5 workers on NYC
node launch-same-url-workers.js 5 "https://www.newsbreak.com/new-york-ny"

# Launch 3 workers on LA
node launch-same-url-workers.js 3 "https://www.newsbreak.com/los-angeles-ca"

# Launch 5 workers (default NYC)
node launch-same-url-workers.js 5
```

### Option 2: Via API

```bash
curl -X POST https://your-server.com/api/extract/multi-thread/start \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{
    "maxWorkers": 5,
    "deviceMode": "desktop",
    "sameUrl": true,
    "url": "https://www.newsbreak.com/new-york-ny"
  }'
```

### Option 3: Via JavaScript (Browser Console)

```javascript
// Open admin page, then run in console:
async function launchSameUrlWorkers(numWorkers, url) {
  const response = await fetch('/api/extract/multi-thread/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maxWorkers: numWorkers,
      deviceMode: 'desktop',
      sameUrl: true,
      url: url
    })
  });

  const data = await response.json();
  console.log('Started:', data);
}

// Launch 5 workers on NYC
launchSameUrlWorkers(5, 'https://www.newsbreak.com/new-york-ny');
```

---

## Expected Results

### First 10 Minutes (5 workers on same URL):
```
Worker #1: 12 ads
Worker #2: 10 ads
Worker #3: 15 ads
Worker #4: 8 ads
Worker #5: 11 ads
──────────────────
Total: 56 ads (vs 10-15 with single worker)
```

### After 1 Hour (5 workers):
```
Worker #1: 45 ads
Worker #2: 38 ads
Worker #3: 52 ads
Worker #4: 35 ads
Worker #5: 48 ads
──────────────────
Total: 218 ads from ONE city
(vs 40-50 with single worker)
```

### After 24 Hours (5 workers, rotating cities):
```
Expected: 3,000-5,000 unique ads
(Each city gets deeper coverage)
```

---

## Configuration

### Request Parameters

```javascript
{
  "maxWorkers": 5,           // Number of parallel workers (1-10)
  "deviceMode": "desktop",   // "desktop" or "mobile"
  "sameUrl": true,           // TRUE for same-URL mode
  "url": "https://..."       // URL for all workers
}
```

### Recommended Settings

**For Maximum Coverage of One City:**
```json
{
  "maxWorkers": 5,
  "sameUrl": true,
  "url": "https://www.newsbreak.com/new-york-ny"
}
```

**For Moderate Resources:**
```json
{
  "maxWorkers": 3,
  "sameUrl": true,
  "url": "https://www.newsbreak.com/los-angeles-ca"
}
```

**For Low Resources (but still faster than single):**
```json
{
  "maxWorkers": 2,
  "sameUrl": true,
  "url": "https://www.newsbreak.com/chicago-il"
}
```

---

## Monitoring

### Check Status

```bash
# Via test script
node test-multi-thread.js status

# Via API
curl https://your-server.com/api/extract/multi-thread/status \
  -H "Cookie: token=YOUR_TOKEN"
```

**Output:**
```json
{
  "isRunning": true,
  "maxWorkers": 5,
  "activeWorkers": 5,
  "totalAds": 87,
  "workers": [
    {
      "workerId": 1,
      "url": "https://www.newsbreak.com/new-york-ny",
      "adsExtracted": 18,
      "status": "running"
    },
    {
      "workerId": 2,
      "url": "https://www.newsbreak.com/new-york-ny",
      "adsExtracted": 16,
      "status": "running"
    },
    // ... all on same URL
  ]
}
```

### Server Logs

Look for these messages:
```
🚀 Starting multi-thread extraction with 5 workers on SAME URL: https://...
🔗 Mode: SAME URL - All workers on https://www.newsbreak.com/new-york-ny
🔷 Starting Worker #1 on SAME URL: https://...
🔷 Starting Worker #2 on SAME URL: https://...
...
✅ All 5 workers started successfully

[After 30 seconds]
────────────────────────────────────────────────────────────
📊 MULTI-THREAD EXTRACTION STATS
⏱️  Runtime: 1 minutes
👷 Active Workers: 5/5
📦 Total Ads Extracted: 23
⚡ Rate: 23.0 ads/min
────────────────────────────────────────────────────────────
  Worker #1: 5 ads, 1m uptime, running
  Worker #2: 4 ads, 1m uptime, running
  Worker #3: 6 ads, 1m uptime, running
  Worker #4: 4 ads, 1m uptime, running
  Worker #5: 4 ads, 1m uptime, running
────────────────────────────────────────────────────────────
```

---

## Comparison: Different URLs vs Same URL

### Different URLs Mode (Default):
```
✅ Covers multiple cities simultaneously
✅ Geographic diversity
❌ May find fewer ads per city (40-50 each)
❌ Moves on before exhausting each city

Best for: Maximum geographic coverage
```

### Same URL Mode (NEW):
```
✅ Deep coverage of ONE city
✅ 3-5x more ads from that city
✅ Exhausts all available ads faster
❌ Less geographic diversity initially

Best for: Maximum ads from specific locations
```

---

## Resource Requirements

### Per Worker:
- Memory: ~150-200MB
- CPU: ~15-20% of 1 core
- Network: Moderate

### Total for 5 Workers (Same URL):
- Memory: ~1GB
- CPU: ~70-100% total
- Network: Moderate

**Server Recommendations:**
- **3 workers**: 1GB RAM, 2 CPU cores
- **5 workers**: 2GB RAM, 4 CPU cores
- **7 workers**: 4GB RAM, 6 CPU cores
- **10 workers**: 8GB RAM, 8+ CPU cores

---

## Strategy Recommendations

### Strategy 1: Deep Dive Single City
```bash
# Extract EVERYTHING from NYC
node launch-same-url-workers.js 5 "https://www.newsbreak.com/new-york-ny"

# Let run for 2-3 hours until exhausted (~200-300 ads)
# Then stop and move to next city
```

### Strategy 2: Rotate Cities with Deep Coverage
```bash
# NYC - 2 hours
node launch-same-url-workers.js 5 "https://www.newsbreak.com/new-york-ny"

# Stop after 2 hours

# LA - 2 hours
node launch-same-url-workers.js 5 "https://www.newsbreak.com/los-angeles-ca"

# Continue rotating...
```

### Strategy 3: Mixed Mode
```bash
# 3 workers on NYC (deep coverage)
# 2 workers on different cities (broad coverage)

# NOT CURRENTLY SUPPORTED - Would need hybrid mode
# For now, choose one strategy at a time
```

---

## Troubleshooting

### Low Ad Count Even with Multiple Workers

**Possible causes:**
1. **NewsBreak has limited inventory** - Normal, 30-50 ads per city is typical
2. **Workers finding same ads** - Database dedupes them automatically
3. **Ad networks blocking** - Try different time of day
4. **Content exhausted** - City fully scraped, rotate to new city

**Solutions:**
```bash
# Check if workers are actually different sessions
curl https://your-server.com/api/extract/multi-thread/logs

# Try different city
node launch-same-url-workers.js 5 "https://www.newsbreak.com/los-angeles-ca"

# Wait and retry later (ads refresh every few hours)
```

### Workers Crashing

**Check logs:**
```bash
# Via API
curl https://your-server.com/api/extract/multi-thread/logs

# Server logs
pm2 logs newsbreak-crawler
```

**Solutions:**
```bash
# Reduce worker count
node launch-same-url-workers.js 3  # Instead of 5

# Check server resources
free -h  # Memory
top      # CPU
```

---

## Stop Extraction

```bash
# Via test script
node test-multi-thread.js stop

# Via API
curl -X POST https://your-server.com/api/extract/multi-thread/stop \
  -H "Cookie: token=YOUR_TOKEN"
```

---

## Files Modified

1. ✅ **app.js** (lines 760-764, 777-788) - Added `sameUrl` and `url` parameters
2. ✅ **src/services/multiThreadExtractor.js** (lines 30-31, 40-44, 56-64) - Added same-URL support
3. ✅ **launch-same-url-workers.js** (NEW) - Quick launch script

---

## Next Steps

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add same-URL multi-worker support"
   git push origin main
   ```

2. **Deploy to Render** (auto-deploys on push)

3. **Launch workers:**
   ```bash
   node launch-same-url-workers.js 5
   ```

4. **Monitor for 10 minutes:**
   ```bash
   node test-multi-thread.js monitor 10
   ```

5. **Check total ads in database:**
   ```bash
   sqlite3 data/ads_crawler.db "SELECT COUNT(*) FROM ads;"
   ```

---

**Last Updated**: 2025-10-02
**Version**: 1.5.1 (Same-URL Support Added)
