# Crawler Time Configuration Examples

## Quick Start Commands

### Run for specific durations:
```bash
# Run for 9 hours straight
npm run crawl:9h

# Run for 24 hours (full day)
npm run crawl:day

# Run indefinitely (until stopped)
npm run crawl:unlimited

# Custom durations
npm start --duration 30s      # 30 seconds
npm start --duration 5m       # 5 minutes
npm start --duration 2h       # 2 hours
npm start --duration 9h       # 9 hours
npm start --duration 9h30m    # 9 hours 30 minutes
npm start --duration 1d       # 1 day
npm start --duration 2d12h    # 2 days 12 hours
```

## Advanced Time Options

### Unlimited Mode (No Restrictions)
```bash
# Run without any time limit
npm start --unlimited

# Or use the shorthand
npm start -u
```

### Programmatic Usage
```javascript
const { createTimeController } = require('./src/utils/timeController');

// 9 hour session
const controller = createTimeController('9h');

// Unlimited session
const controller = createTimeController('unlimited');

// Complex duration
const controller = createTimeController('7h45m30s');

// Scheduled to run until specific time
const controller = createTimeController({
  until: '2024-12-25 18:00:00'
});
```

## Features

✅ **No Time Restrictions** - Run for any duration you want
✅ **Flexible Formats** - Seconds, minutes, hours, days, or combinations
✅ **Unlimited Mode** - Run indefinitely until manually stopped
✅ **Progress Updates** - Shows elapsed time and remaining time
✅ **Graceful Shutdown** - Ctrl+C stops cleanly at any time
✅ **No Maximum Limit** - Can run for days or weeks if needed

## Examples for Long Running Sessions

```bash
# 9 hours for overnight crawling
npm start --duration 9h

# 12 hours for half-day session
npm start --duration 12h

# 48 hours for weekend run
npm start --duration 48h

# 7 days for weekly collection
npm start --duration 7d

# Combined time units
npm start --duration 3d6h30m  # 3 days, 6 hours, 30 minutes
```

## Monitoring Long Sessions

The crawler will:
- Log progress every minute in unlimited mode
- Show remaining time when less than 1 minute left
- Display total elapsed time on completion
- Handle interruptions gracefully with Ctrl+C
- Save all data before stopping

## System Requirements for Long Runs

For extended sessions (9+ hours):
- Stable internet connection
- AdsPower running continuously
- Sufficient disk space for logs and data
- System set to not sleep/hibernate
- Consider using a VPS or dedicated machine