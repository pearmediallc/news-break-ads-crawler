# NewsBreak Ads Crawler

## 🎯 Description

A web-based tool for extracting and analyzing sponsored content from NewsBreak. Features real-time monitoring, automated scrolling, and multiple export formats (JSON, CSV, Excel).

## ✨ Features

- **No-Click Extraction**: Safely extracts ads without clicking or opening new tabs
- **Web Dashboard**: User-friendly interface for controlling extraction
- **Auto-Scrolling**: Configurable scroll duration (1-60 minutes)
- **Real-Time Monitoring**: Live extraction status and progress
- **Multiple Export Formats**: JSON, CSV, and Excel
- **Session Management**: Timestamped data files for each extraction run
- **Docker Support**: Ready for cloud deployment

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open browser
http://localhost:3000
```

## 📁 Project Structure

```
news-break-ads-crawler/
├── app.js                 # Express server
├── extractAds.js          # Main extractor logic
├── package.json           # Dependencies
├── Dockerfile             # Docker configuration
├── render.yaml            # Render deployment config
├── public/                # Web UI
│   └── index.html        # Dashboard interface
└── src/                   # Utilities
    └── utils/
        └── logger.js     # Logging utility
```

## 🌐 API Endpoints

- `GET /` - Web dashboard
- `GET /api/health` - Health check
- `POST /api/extract/start` - Start extraction
- `POST /api/extract/stop` - Stop extraction
- `GET /api/extract/status` - Get current status
- `GET /api/extract/sessions` - List all sessions
- `GET /api/extract/latest` - Get latest extracted data
- `GET /api/extract/export/:sessionId` - Export session data

## 🎮 Usage

1. **Start Extraction**:
   - Enter NewsBreak URL (default: https://www.newsbreak.com/new-york-ny)
   - Set extraction duration (1-60 minutes)
   - Click "Start Extraction"

2. **Monitor Progress**:
   - View real-time logs
   - Check extraction status
   - See ad count updates

3. **Export Data**:
   - JSON: Raw data format
   - CSV: Spreadsheet compatible
   - Excel: Full formatting

## 🐳 Docker Deployment

```bash
# Build image
docker build -t newsbreak-crawler .

# Run container
docker run -p 3000:3000 newsbreak-crawler
```

## 📝 Environment Variables

```env
PORT=3000
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
DEFAULT_EXTRACTION_DURATION=5
DEFAULT_NEWSBREAK_URL=https://www.newsbreak.com/new-york-ny
```

## 🔧 Technical Details

- **Browser Automation**: Puppeteer with Chrome (US-based server)
- **No-Click Policy**: Event listeners block all navigation
- **Iframe Extraction**: Cross-origin content access
- **Session Storage**: Timestamped JSON files
- **Auto-Scrolling**: 15-second intervals

## 📦 Dependencies

- Express.js - Web server
- Puppeteer - Browser automation
- XLSX - Excel export
- Winston - Logging
- CORS - Cross-origin support

## 🚢 Deployment

This app is configured for deployment on Render.com:

1. Push code to GitHub
2. Connect GitHub to Render
3. Deploy using `render.yaml`
4. Set environment variables
5. Access at: `https://your-app.onrender.com`

## 📄 License

Private/Proprietary

## 🆘 Support

For issues or questions, check the logs in `/data/extraction.log` or the web dashboard's console output.
