# 🔴 502 Bad Gateway Fix for Render

## Root Causes Identified

Looking at your logs:
```
[GET]502 /api/extract/status/1759502774393
[GET]502 /api/events
[GET]404 /api/extract/status/1759502774393 (after restart)
```

### Issues:

1. **Extraction sessions lost on restart** → 404 errors
2. **SSE connections timing out** → 502 on `/api/events`
3. **Multiple concurrent requests** → Server overload
4. **No persistent session storage** → MemoryStore warning

---

## 🛠️ Solutions

### **Issue 1: Sessions Lost on Restart**

**Problem:** Extraction IDs like `1759502774393` don't persist across deployments

**Solution:**
```javascript
// Store extraction sessions in database, not memory
// After restart, check database for active sessions
// Return proper 410 Gone instead of 404 for old sessions
```

### **Issue 2: SSE Timeouts**

**Problem:** `/api/events` connections timing out causing 502

**Solution:**
```javascript
// Add SSE keepalive pings every 15 seconds
// Set proper timeout headers
// Handle connection drops gracefully
```

### **Issue 3: Too Many Concurrent Requests**

**Problem:** Dashboard polls `/api/extract/status` every second

**Solution:**
```javascript
// Increase polling interval to 3-5 seconds
// Add request rate limiting
// Use SSE for real-time updates instead of polling
```

### **Issue 4: Memory Sessions**

**Problem:** `connect.session() MemoryStore` warning

**Solution:**
```javascript
// Use database-backed sessions (already have SQLite)
// Or use Render's persistent disk
```

---

## Quick Fix for 502 Errors

The main issue is **Render is killing your app** because:
1. Health check path works ✅
2. But app gets overwhelmed by requests ❌

### Immediate Actions:

1. **Disable auto-extraction on startup**
2. **Add rate limiting**
3. **Increase Render timeout**
4. **Fix SSE connections**

---

## Implementation

I'll create:
1. Rate limiting middleware
2. Persistent session storage
3. SSE keepalive mechanism
4. Better error handling for old sessions
5. Updated render.yaml with proper timeouts
