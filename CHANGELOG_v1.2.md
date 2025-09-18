# News Break Ads Crawler v1.2 - Release Notes

## 🎉 What's New in Version 1.2

### 📱 Mobile Ad Extraction Support
- **Desktop Mode**: Traditional desktop browser extraction
- **Mobile Mode**: Simulates iPhone/Android devices for mobile-specific ads
- **Tablet Mode**: Simulates iPad/Android tablets
- **Mixed Mode**: Rotates between different devices during extraction

### ⏰ Unlimited Duration Support
- Removed 60-minute limitation
- Can now run for up to 7 days (10,080 minutes)
- Support for flexible time formats:
  - `9h` for 9 hours
  - `24h` for 24 hours
  - `7d` for 7 days
  - `--unlimited` for indefinite running

### 🎯 Mobile-Specific Features

#### Device Emulation
- iPhone 14, 13, SE
- Android Pixel & Samsung devices
- iPad Pro & iPad Mini
- Automatic viewport and user-agent switching

#### Mobile Ad Detection
- Banner ads (320x50, 320x100)
- Native in-feed ads
- Sticky ads (top/bottom)
- Interstitial full-screen ads
- Mobile video ads
- In-article mobile ads

#### Mobile Ad Networks
- Google AdSense Mobile
- Facebook Audience Network
- Amazon Mobile Ads
- Taboola/Outbrain Mobile
- AppLovin, Unity Ads
- Branch.io, AppsFlyer tracking

### 💻 UI Improvements
- Device mode selector in control panel
- Version badge showing v1.2
- Fixed time field alignment
- Better duration helper text

## 🚀 How to Use

### Command Line
```bash
# Run for 9 hours in mobile mode
node adsPowerExtractor.js https://newsbreak.com 540 mobile

# Run for 24 hours in mixed mode
node adsPowerExtractor.js https://newsbreak.com 1440 mixed

# Run unlimited in desktop mode
npm start --unlimited
```

### Web UI
1. Select device mode from dropdown (Desktop/Mobile/Tablet/Mixed)
2. Enter duration (540 minutes = 9 hours)
3. Click Start Extraction

## 📊 Mobile vs Desktop Ads

Mobile ads typically include:
- More native content ads
- Sticky banner ads
- Full-screen interstitials
- Different ad sizes optimized for mobile
- Touch-optimized call-to-action buttons

## 🔧 Technical Details

### Mobile Configuration
- User agents for 6+ different devices
- Accurate viewport dimensions with device pixel ratios
- Touch event simulation
- Mobile-specific CSS selectors
- Responsive ad size detection

### Performance
- Efficient ad deduplication
- Smart scrolling for mobile viewports
- Automatic popup/overlay handling
- Device rotation in mixed mode

## 📈 Benefits

1. **Comprehensive Coverage**: Capture both mobile and desktop ad inventory
2. **Better Targeting**: See how ads differ between devices
3. **Extended Sessions**: Run for days to collect more data
4. **Flexibility**: Choose the right device mode for your needs

## 🐛 Bug Fixes
- Fixed UI time field alignment
- Removed artificial time limits
- Improved ad detection accuracy
- Better error handling for mobile modes

## 📝 Notes
- Mobile mode requires active AdsPower profile
- Some ads may only appear on specific devices
- Mixed mode rotates devices every 5 scans
- Mobile ads may have different content than desktop

---

**Version**: 1.2.0
**Release Date**: December 2024
**Compatibility**: Node.js 18+, AdsPower 2.0+