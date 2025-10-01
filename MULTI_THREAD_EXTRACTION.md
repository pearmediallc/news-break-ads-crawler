# Multi-Thread Extraction - NewsBreak Ads Crawler

## Overview
Run multiple parallel extraction workers simultaneously to **dramatically increase ad collection speed**.

## How It Works

### Architecture
```
┌─────────────────────────────────────────────────┐
│         Multi-Thread Extractor Manager         │
└─────────────────────────────────────────────────┘
           │              │              │
    ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼───────┐
    │  Worker 1  │ │  Worker 2  │ │  Worker 3  │
    │  (NYC)     │ │  (LA)      │ │  (Chicago) │
    └──────┬─────┘ └─────┬──────┘ └────┬───────┘
           │              │              │
           └──────────────┴──────────────┘
                          │
                   ┌──────▼───────┐
                   │   Shared DB  │
                   │ (Deduped Ads)│
                   └──────────────┘
```

### Features
- ✅ **Parallel Extraction**: Multiple workers extract simultaneously
- ✅ **Automatic URL Assignment**: Each worker gets a different city
- ✅ **Shared Database**: All ads saved to same database with deduplication
- ✅ **Auto-Recovery**: Workers restart automatically on failure
- ✅ **Resource Monitoring**: Tracks memory, CPU, and worker health
- ✅ **Coordinated Rotation**: Workers don't overlap on same URLs

## Performance Comparison

| Mode | Workers | Expected Rate | 24h Estimate |
|------|---------|---------------|--------------|
| **Single-Thread** | 1 | 40-50 ads/hour | 1,000 ads |
| **Multi-Thread (3x)** | 3 | 120-150 ads/hour | **3,000 ads** |
| **Multi-Thread (5x)** | 5 | 200-250 ads/hour | **5,000 ads** |
| **Multi-Thread (10x)** | 10 | 400-500 ads/hour | **10,000 ads** |

## API Usage

### Start Multi-Thread Extraction

**Endpoint**: `POST /api/extract/multi-thread/start`

**Request**:
```json
{
  "maxWorkers": 3,
  "deviceMode": "desktop"
}
```

**Parameters**:
- `maxWorkers` (optional): Number of parallel workers (1-10, default: 3)
- `deviceMode` (optional): "desktop" or "mobile" (default: "desktop")

**Response**:
```json
{
  "success": true,
  "message": "Multi-thread extraction started with 3 workers",
  "status": {
    "isRunning": true,
    "sessionId": "multi_1759200000000",
    "maxWorkers": 3,
    "activeWorkers": 3,
    "totalAds": 0,
    "workers": [
      {
        "workerId": 1,
        "url": "https://www.newsbreak.com/new-york-ny",
        "status": "running",
        "adsExtracted": 0
      },
      ...
    ]
  }
}
```

**Example** (curl):
```bash
curl -X POST http://localhost:3000/api/extract/multi-thread/start \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{"maxWorkers": 5, "deviceMode": "desktop"}'
```

**Example** (JavaScript):
```javascript
async function startMultiThread(workers = 3) {
  const response = await fetch('/api/extract/multi-thread/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maxWorkers: workers,
      deviceMode: 'desktop'
    })
  });

  const data = await response.json();
  console.log('Started:', data);
}

// Start with 5 workers
startMultiThread(5);
```

---

### Get Status

**Endpoint**: `GET /api/extract/multi-thread/status`

**Response**:
```json
{
  "success": true,
  "isRunning": true,
  "sessionId": "multi_1759200000000",
  "startTime": 1759200000000,
  "runtime": 1800000,
  "maxWorkers": 3,
  "activeWorkers": 3,
  "totalAds": 247,
  "workers": [
    {
      "workerId": 1,
      "url": "https://www.newsbreak.com/new-york-ny",
      "status": "running",
      "adsExtracted": 89,
      "errors": 0,
      "uptime": 1800000,
      "lastUpdate": "2025-10-02T12:30:00.000Z"
    },
    {
      "workerId": 2,
      "url": "https://www.newsbreak.com/los-angeles-ca",
      "status": "running",
      "adsExtracted": 78,
      "errors": 0,
      "uptime": 1800000,
      "lastUpdate": "2025-10-02T12:30:00.000Z"
    },
    {
      "workerId": 3,
      "url": "https://www.newsbreak.com/chicago-il",
      "status": "running",
      "adsExtracted": 80,
      "errors": 0,
      "uptime": 1800000,
      "lastUpdate": "2025-10-02T12:30:00.000Z"
    }
  ]
}
```

**Example**:
```javascript
async function getStatus() {
  const response = await fetch('/api/extract/multi-thread/status');
  const data = await response.json();

  if (data.isRunning) {
    console.log(`Active Workers: ${data.activeWorkers}/${data.maxWorkers}`);
    console.log(`Total Ads: ${data.totalAds}`);
    console.log(`Runtime: ${Math.floor(data.runtime / 60000)} minutes`);

    data.workers.forEach(w => {
      console.log(`Worker ${w.workerId}: ${w.adsExtracted} ads from ${w.url}`);
    });
  }
}

// Poll status every 10 seconds
setInterval(getStatus, 10000);
```

---

### Stop Multi-Thread Extraction

**Endpoint**: `POST /api/extract/multi-thread/stop`

**Response**:
```json
{
  "success": true,
  "message": "Multi-thread extraction stopped",
  "finalStats": {
    "totalAds": 247,
    "runtime": 1800000,
    "activeWorkers": 0,
    "workers": [...]
  }
}
```

**Example**:
```javascript
async function stopMultiThread() {
  const response = await fetch('/api/extract/multi-thread/stop', {
    method: 'POST'
  });

  const data = await response.json();
  console.log('Stopped. Final stats:', data.finalStats);
}
```

---

### Get Logs

**Endpoint**: `GET /api/extract/multi-thread/logs?workerId=1&limit=50`

**Parameters**:
- `workerId` (optional): Specific worker ID (1, 2, 3...). If omitted, returns all logs.
- `limit` (optional): Number of recent logs (default: 100)

**Response**:
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-10-02T12:30:15.000Z",
      "level": "info",
      "message": "✨ Found 3 new ads",
      "workerId": 1
    },
    ...
  ],
  "count": 50
}
```

---

## Server-Side Monitoring

The multi-thread extractor logs stats every 30 seconds:

```
────────────────────────────────────────────────────────────
📊 MULTI-THREAD EXTRACTION STATS
⏱️  Runtime: 30 minutes
👷 Active Workers: 3/3
📦 Total Ads Extracted: 247
⚡ Rate: 8.2 ads/min
────────────────────────────────────────────────────────────
  Worker #1: 89 ads, 30m uptime, running
  Worker #2: 78 ads, 30m uptime, running
  Worker #3: 80 ads, 30m uptime, running
────────────────────────────────────────────────────────────
```

---

## Configuration

### Worker Count Recommendations

**Based on Server Resources:**

| Server RAM | CPU Cores | Recommended Workers | Max Workers |
|------------|-----------|---------------------|-------------|
| 512MB | 1 core | 1 | 2 |
| 1GB | 1-2 cores | 2 | 3 |
| 2GB | 2-4 cores | 3-4 | 5 |
| 4GB | 4+ cores | 5-7 | 10 |
| 8GB+ | 8+ cores | 8-10 | 10 |

**Memory Per Worker**: ~150-250MB
**CPU Per Worker**: ~15-25% of 1 core

### Adjusting Worker Count

You can change the number of workers anytime:

1. Stop current extraction
2. Start with new worker count

```javascript
// Stop
await fetch('/api/extract/multi-thread/stop', { method: 'POST' });

// Wait 2 seconds
await new Promise(r => setTimeout(r, 2000));

// Start with 5 workers instead
await fetch('/api/extract/multi-thread/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ maxWorkers: 5 })
});
```

---

## How Workers Coordinate

### URL Assignment
- Each worker gets assigned a **different city** at startup
- Workers rotate through cities independently
- No overlap - workers never extract from same URL simultaneously

### Deduplication
- All workers save to the **same database**
- Database has unique constraints on ad content
- Duplicates across workers are automatically filtered
- Each worker also maintains its own in-memory deduplication

### Failure Recovery
- If a worker crashes, it **automatically restarts** after 5 seconds
- New worker gets a fresh URL assignment
- Extraction continues without interruption
- Max 10 restart attempts before giving up

---

## Monitoring & Health Checks

### Per-Worker Health
- **Status tracking**: running, error, restarting
- **Error counting**: Tracks consecutive errors
- **Uptime monitoring**: Shows runtime per worker
- **Ads rate**: Calculates ads/minute per worker

### System-Wide Monitoring
- **Total throughput**: Combined ads from all workers
- **Active worker count**: How many are currently running
- **Overall rate**: Total ads per minute across all workers
- **Resource usage**: Memory and CPU tracking (logged every 30s)

### Automatic Actions
- **Stuck workers**: If a worker has <10 ads after 10 minutes, it rotates URLs
- **High memory**: If worker uses >500MB, browser restarts
- **Crashes**: Workers auto-restart on failure
- **URL rotation**: Workers automatically rotate cities when stuck

---

## Best Practices

### Starting Multi-Thread Extraction

1. **Start with 3 workers** to test stability
2. **Monitor for 5-10 minutes** to check resource usage
3. **Increase workers gradually** if server has capacity
4. **Watch server logs** for any errors or warnings

### Optimal Configuration

For **24/7 unlimited extraction**:
```json
{
  "maxWorkers": 5,
  "deviceMode": "desktop"
}
```

This provides:
- **200-250 ads/hour** extraction rate
- **5,000+ ads/day** expected output
- Reasonable server resource usage
- Good stability for long runs

### Scaling Up

To maximize extraction (requires powerful server):
```json
{
  "maxWorkers": 10,
  "deviceMode": "desktop"
}
```

Requirements:
- **8GB+ RAM**
- **8+ CPU cores**
- Fast disk I/O
- Stable network

Expected:
- **400-500 ads/hour**
- **10,000+ ads/day**

---

## Troubleshooting

### Workers Keep Crashing
**Symptom**: Workers restart frequently

**Solutions**:
1. Reduce `maxWorkers` (e.g., from 5 to 3)
2. Check server memory: `free -h`
3. Check server CPU: `top` or `htop`
4. Review logs for specific errors

### Low Ad Count
**Symptom**: Few ads being extracted

**Solutions**:
1. Check if workers are actually running: `GET /api/extract/multi-thread/status`
2. Verify workers are on different URLs
3. Check database for duplicates (may be finding same ads)
4. Review worker logs for extraction errors

### High Memory Usage
**Symptom**: Server running out of memory

**Solutions**:
1. Reduce `maxWorkers`
2. Restart extraction to clear memory
3. Check for memory leaks in logs
4. Consider upgrading server

### One Worker Stuck
**Symptom**: One worker not progressing

**Solutions**:
- Workers automatically rotate after 10 minutes with <10 ads
- Stop and restart extraction if problem persists
- Check individual worker logs: `GET /api/extract/multi-thread/logs?workerId=X`

---

## Comparison: Single vs Multi-Thread

### Single-Thread Extraction
```
✅ Lower resource usage (~200MB)
✅ Simpler monitoring
✅ More stable for long runs
❌ Slower (40-50 ads/hour)
❌ Can get stuck on exhausted locations
```

### Multi-Thread Extraction (3+ workers)
```
✅ Much faster (3-10x speed)
✅ Covers more locations simultaneously
✅ Better utilization of server resources
✅ Built-in redundancy (if one fails, others continue)
❌ Higher memory usage (500MB-2GB+)
❌ More complex monitoring
❌ Higher server requirements
```

---

## Example Integration

### Complete Workflow

```javascript
class MultiThreadController {
  constructor() {
    this.isRunning = false;
    this.stats = null;
  }

  async start(workers = 3) {
    try {
      const response = await fetch('/api/extract/multi-thread/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxWorkers: workers })
      });

      const data = await response.json();

      if (data.success) {
        this.isRunning = true;
        console.log(`✅ Started with ${workers} workers`);
        this.startMonitoring();
      }
    } catch (error) {
      console.error('Failed to start:', error);
    }
  }

  startMonitoring() {
    this.monitorInterval = setInterval(async () => {
      await this.updateStats();
    }, 10000); // Every 10 seconds
  }

  async updateStats() {
    const response = await fetch('/api/extract/multi-thread/status');
    this.stats = await response.json();

    if (this.stats.isRunning) {
      const runtime = Math.floor(this.stats.runtime / 60000);
      const rate = (this.stats.totalAds / Math.max(runtime, 1)).toFixed(1);

      console.log(`📊 Runtime: ${runtime}m | Ads: ${this.stats.totalAds} | Rate: ${rate}/min`);
      console.log(`👷 Workers: ${this.stats.activeWorkers}/${this.stats.maxWorkers}`);
    }
  }

  async stop() {
    try {
      await fetch('/api/extract/multi-thread/stop', { method: 'POST' });
      this.isRunning = false;

      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
      }

      console.log('✅ Stopped');
    } catch (error) {
      console.error('Failed to stop:', error);
    }
  }
}

// Usage
const controller = new MultiThreadController();
await controller.start(5); // Start with 5 workers
// ... runs indefinitely ...
await controller.stop(); // Stop when done
```

---

## Files Modified

1. **app.js**: Added multi-thread API endpoints
2. **src/services/multiThreadExtractor.js**: NEW - Worker manager
3. **src/services/extractionWorker.js**: Already supports multi-thread mode
4. **src/config/urlRotation.js**: Already available for URL management

---

## Next Steps

1. **Deploy** changes to production
2. **Test** with 3 workers initially
3. **Monitor** performance and resource usage
4. **Scale up** to 5-10 workers if server can handle it
5. **Optimize** based on observed performance

---

**Version**: 1.5
**Last Updated**: 2025-10-02
**Estimated Performance**: 3-10x faster than single-thread
