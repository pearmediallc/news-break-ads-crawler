# 🚀 Render Deployment Guide - News Break Ads Crawler v1.3

This guide covers deploying the News Break Ads Crawler to Render platform.

## 📋 Prerequisites

- GitHub repository with your code
- Render account (free tier available)
- Docker support enabled

## 🔧 Deployment Steps

### 1. Repository Setup

Ensure your repository contains:
- ✅ `render.yaml` configuration file
- ✅ `Dockerfile` for containerization
- ✅ `.env.example` with environment variables
- ✅ Health check endpoint at `/health`

### 2. Create New Service on Render

1. **Login to Render Dashboard**
   - Go to [render.com](https://render.com)
   - Connect your GitHub account

2. **Create New Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select the repository: `news-break-ads-crawler`

3. **Configure Service Settings**
   ```yaml
   Name: news-break-ads-crawler-v1-3
   Environment: Docker
   Region: Oregon (US West)
   Branch: main
   Dockerfile Path: ./Dockerfile
   ```

### 3. Environment Variables

Set these environment variables in Render dashboard:

```bash
# Required Variables
NODE_ENV=production
PORT=10000
ENABLE_FILE_LOGGING=false

# Puppeteer Configuration
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Optional Variables
DEFAULT_TARGET_URL=https://www.newsbreak.com/new-york-ny
DEFAULT_EXTRACTION_DURATION=5
LOG_LEVEL=info
```

### 4. Deploy Configuration

**Auto-deploy Settings:**
- ✅ Auto-deploy: Enabled
- ✅ Branch: main
- ✅ Health check: `/health`

**Resource Allocation:**
- Plan: Starter ($7/month) or Free (with limitations)
- RAM: 512MB (minimum recommended)
- CPU: Shared
- Disk: 2GB persistent storage

### 5. Persistent Storage Setup

**Disk Configuration:**
```yaml
disk:
  name: data-storage
  mountPath: /opt/render/project/src/data
  sizeGB: 2
```

This ensures extracted data persists across deployments.

## 🔍 Deployment Verification

### 1. Check Deployment Status
- Monitor build logs in Render dashboard
- Verify Docker image builds successfully
- Check service starts without errors

### 2. Test Health Endpoint
```bash
curl https://your-app-name.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-21T..."
}
```

### 3. Access Application
- **Dashboard**: `https://your-app-name.onrender.com`
- **API Endpoints**: `https://your-app-name.onrender.com/api/*`

## 🎯 Version 1.3 Features

### ✨ New in v1.3:
- **Real-time Updates**: Server-Sent Events (SSE) for live ad streaming
- **Enhanced Mobile Support**: Improved mobile device extraction
- **Better Error Handling**: Robust browser crash recovery
- **Deployment Ready**: Auto-headless mode detection
- **Persistent Storage**: Database and session file persistence
- **Time Filtering**: Session-specific time-based ad filtering

### 🔧 Production Optimizations:
- Headless browser mode for server deployment
- Memory management for long-running extractions
- Automatic browser restart on crashes
- Database sync with foreign key constraints
- CORS configuration for cross-origin requests

## 🐛 Troubleshooting

### Common Issues:

**1. Build Failures**
```bash
# Check Dockerfile syntax
# Verify all dependencies in package.json
# Ensure proper file permissions
```

**2. Browser Launch Errors**
```bash
# Verify PUPPETEER_EXECUTABLE_PATH is set correctly
# Check Chrome installation in container
# Review browser launch arguments
```

**3. Memory Issues**
```bash
# Upgrade to higher tier plan
# Monitor memory usage in dashboard
# Implement cleanup for long extractions
```

**4. Persistent Storage**
```bash
# Verify disk mount path is correct
# Check write permissions for data directory
# Monitor disk usage
```

## 📊 Monitoring

### Application Metrics:
- **Health**: `/health` endpoint
- **Logs**: Render dashboard logs
- **Performance**: Memory and CPU usage
- **Storage**: Data directory size

### Key Metrics to Monitor:
- Response times for API endpoints
- Extraction success rates
- Browser crash frequency
- Database sync performance

## 🔐 Security Considerations

- Environment variables stored securely in Render
- No sensitive data in source code
- HTTPS enforced by default
- Container isolation
- Read-only file system (except data directory)

## 📈 Scaling

### Horizontal Scaling:
- Multiple service instances
- Load balancer configuration
- Session affinity for WebSocket connections

### Vertical Scaling:
- Upgrade Render plan for more resources
- Monitor resource usage
- Optimize extraction algorithms

## 🔄 Updates and Maintenance

### Deploying Updates:
1. Push changes to main branch
2. Render auto-deploys with zero downtime
3. Monitor deployment logs
4. Verify functionality post-deployment

### Database Migrations:
- Backup existing data before schema changes
- Test migrations in staging environment
- Monitor foreign key constraints

---

## 🎉 Deployment Complete!

Your News Break Ads Crawler v1.3 is now live on Render with:
- ✅ Real-time ad extraction
- ✅ Mobile and desktop support
- ✅ Persistent data storage
- ✅ Auto-scaling capabilities
- ✅ Production-ready configuration

**Live URL**: `https://news-break-ads-crawler-v1-3.onrender.com`

For support, check the logs in Render dashboard or refer to the application documentation.