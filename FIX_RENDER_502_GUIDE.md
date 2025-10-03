# 🔴 Complete Fix for Render 502 Errors

## Problem Summary

Your logs show:
```
[GET]502 /api/extract/status/1759502774393  # 502 = Server timeout/overload
[GET]502 /api/events                        # SSE timeout
[GET]404 /api/extract/status/1759502774393  # Session lost after restart
```

---

## Root Causes

1. **SSE connections have NO keepalive** → Render times them out → 502
2. **Extraction sessions stored in memory** → Lost on restart → 404
3. **No rate limiting** → Too many requests → Server overload
4. **Dashboard polls too frequently** → Every second → Unnecessary load

---

## ✅ Solutions

### 1. Add SSE Keepalive (Most Critical)

**File:** `app.js` around line 936

**Find this:**
```javascript
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
   '

Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write('data: {"type":"connected","message":"Real-time updates connected"}\n\n');

  // Add connection to set
  sseConnections.add(res);
```

**Add keepalive AFTER adding to sseConnections:**
```javascript
  // Add connection to set
  sseConnections.add(res);

  // 🔧 FIX: Add keepalive ping every 15 seconds
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch (error) {
      clearInterval(keepaliveInterval);
      sseConnections.delete(res);
    }
  }, 15000); // 15 seconds

  // Rest of code...
  req.on('close', () => {
    clearInterval(keepaliveInterval); // Clean up keepalive
    sseConnections.delete(res);
    console.log(`📡 SSE connection closed (${sseConnections.size} remaining)`);
  });
```

---

### 2. Fix 404 Errors for Old Sessions

**File:** `app.js` - Find `/api/extract/status/:id` endpoint

**Change from:**
```javascript
if (!extraction) {
    return res.status(404).json({ error: 'Extraction not found' });
}
```

**To:**
```javascript
if (!extraction) {
    // Check if it's an old session (before last restart)
    const extractionId = parseInt(req.params.id);
    const isOldSession = extractionId < (Date.now() - 24 * 60 * 60 * 1000); // Older than 24 hours

    if (isOldSession) {
        return res.status(410).json({
            error: 'Extraction session expired or lost during server restart',
            hint: 'Please start a new extraction'
        });
    }

    return res.status(404).json({ error: 'Extraction not found' });
}
```

---

### 3. Add Simple Rate Limiting

**File:** `app.js` - Add BEFORE other routes (around line 31)

```javascript
// Simple rate limiting to prevent server overload
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // Max 100 requests per minute per IP

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const record = requestCounts.get(ip);

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }

  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  record.count++;
  next();
});
```

---

### 4. Update render.yaml for Better Timeout

**File:** `render.yaml`

**Add these settings:**
```yaml
services:
  - type: web
    name: news-break-ads-crawler-v1-4
    runtime: docker
    env: docker
    dockerfilePath: ./Dockerfile
    healthCheckPath: /health

    # 🔧 ADD THESE:
    numInstances: 1
    plan: starter  # or free
    region: oregon

    # Increase timeouts
    healthCheckMaxConnectTimeout: 10s
    healthCheckMaxRetries: 5

    envVars:
      # ... existing vars ...

      # 🔧 ADD THESE:
      - key: SSE_KEEPALIVE_INTERVAL
        value: 15000
      - key: REQUEST_TIMEOUT
        value: 30000
```

---

### 5. Update Dashboard Polling (Optional but Recommended)

**File:** `public/index.html` - Find status polling

**Change from:**
```javascript
setInterval(() => {
  fetch(/api/extract/status/${extractionId})
}, 1000); // Every 1 second
```

**To:**
```javascript
setInterval(() => {
  fetch(`/api/extract/status/${extractionId}`)
}, 3000); // Every 3 seconds (reduces load by 66%)
```

---

## 📝 Quick Implementation Checklist

```bash
# 1. Edit app.js
# - Add SSE keepalive (line ~945)
# - Add rate limiting (line ~31)
# - Fix 404 to 410 for old sessions

# 2. Edit render.yaml
# - Add timeout settings
# - Add environment variables

# 3. Optional: Edit public/index.html
# - Increase polling interval

# 4. Test locally
npm start
# Open browser, check console for errors

# 5. Commit and push
git add .
git commit -m "Fix: Add SSE keepalive, rate limiting, better error handling"
git push

# 6. Monitor Render logs
# Should see NO MORE 502 errors!
```

---

## 🧪 Verification

After deployment, check:

1. **SSE Keepalive Working:**
   ```
   # In browser console (Network tab)
   # Should see `:keepalive` messages every 15 seconds
   ```

2. **No 502 Errors:**
   ```
   # Render logs should show:
   [GET]200 /api/events
   [GET]200 /api/extract/status/...
   ```

3. **Old Sessions Return 410:**
   ```
   # Try accessing old extraction ID:
   curl https://your-app.onrender.com/api/extract/status/1759502774393
   # Should return: 410 Gone (not 404)
   ```

---

## Why This Works

| Fix | Problem Solved |
|-----|---------------|
| **SSE Keepalive** | Prevents Render from timing out long-lived connections |
| **Rate Limiting** | Prevents server overload from too many requests |
| **410 vs 404** | Properly handles old/expired sessions |
| **Render Timeout** | Gives app more time to respond during startup |
| **Reduced Polling** | Decreases unnecessary load by 66% |

---

## Expected Result

**Before:**
```
[GET]502 /api/events               ❌
[GET]502 /api/extract/status/...  ❌
[GET]404 /api/extract/status/...  ❌
```

**After:**
```
[GET]200 /api/events               ✅
[GET]200 /api/extract/status/...  ✅
[GET]410 /api/extract/status/...  ✅ (for old sessions)
```

---

## If Problems Persist

1. **Check Render logs** for specific error messages
2. **Verify persistent disk** is mounted at `/usr/src/app/data`
3. **Check memory usage** - Render free tier has 512MB limit
4. **Disable auto-extraction** on startup if enabled

---

## Alternative: Disable SSE Entirely

If SSE still causes issues, you can disable it and use polling only:

**In app.js:**
```javascript
app.get('/api/events', (req, res) => {
  res.status(503).json({
    error: 'SSE disabled on Render',
    usePolling: true
  });
});
```

Then dashboard will fall back to polling automatically.

---

**Apply these 5 fixes and your 502 errors should disappear!** 🎯
