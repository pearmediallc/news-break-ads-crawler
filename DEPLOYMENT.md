# NewsBreak Ads Crawler - Deployment Guide

## 🚀 Server Deployment Instructions

### Headless Mode Auto-Detection
The application automatically detects server environments and switches to headless mode:

- **Development** (GUI): Shows browser window for debugging
- **Production** (Headless): Runs in background without GUI

### Environment Variables for Production

Set any of these to enable headless mode:

```bash
export NODE_ENV=production
# OR
export DEPLOYMENT=true
# OR run on a server without display (Linux servers auto-detect)
```

### Server Requirements

1. **Node.js 18+**
2. **Chrome/Chromium** (for headless browser)
3. **Memory**: 4GB+ recommended for unlimited extractions
4. **Storage**: Sufficient space for session data

### Installation on Server

```bash
# Install dependencies
npm install

# Install Chrome on Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y chromium-browser

# Install Chrome on CentOS/RHEL
sudo yum install -y chromium

# Set production mode
export NODE_ENV=production

# Start the server
npm start
```

### Testing Headless Mode Locally

```bash
# Test headless mode on development machine
export DEPLOYMENT=true
npm start
```

### Container Deployment (Docker)

```dockerfile
FROM node:18-slim

# Install Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
```

### PM2 Process Manager (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
NODE_ENV=production pm2 start app.js --name "newsbreak-crawler"

# Save PM2 configuration
pm2 save
pm2 startup
```

## ✅ Deployment Verification

1. **Start the server** with production mode
2. **Check logs** for "Headless (Server/Production)" message
3. **Start extraction** - should work without browser window
4. **Close terminal/SSH** - extraction continues running
5. **Check data** is being collected in `/data/sessions/`

## 🔧 Troubleshooting

- **Chrome not found**: Install chromium-browser package
- **Permission denied**: Run with proper permissions or use Docker
- **Memory issues**: Increase server memory or use `--max-old-space-size` flag
- **Network issues**: Ensure server has internet access

## 📊 Monitoring

- Check logs: `tail -f logs/extraction.log`
- Monitor memory: Built-in memory reporting every 10 scans
- View extractions: Access web interface at `http://server:3000`