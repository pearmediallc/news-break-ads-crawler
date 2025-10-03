-- Database schema for News Break Ads Crawler

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  total_ads INTEGER DEFAULT 0,
  url TEXT,
  duration TEXT,
  device_mode TEXT,
  status TEXT DEFAULT 'active',
  file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ads table
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ad_id TEXT,
  ad_signature TEXT,
  heading TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  ad_network TEXT,
  ad_type TEXT,
  container_id TEXT,
  timestamp DATETIME NOT NULL,
  element_html TEXT,
  position_x INTEGER,
  position_y INTEGER,
  width INTEGER,
  height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- Ad network tracking
CREATE TABLE IF NOT EXISTS ad_networks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network_name TEXT UNIQUE NOT NULL,
  total_ads INTEGER DEFAULT 0,
  first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ads_session_id ON ads(session_id);
CREATE INDEX IF NOT EXISTS idx_ads_timestamp ON ads(timestamp);
CREATE INDEX IF NOT EXISTS idx_ads_ad_network ON ads(ad_network);
CREATE INDEX IF NOT EXISTS idx_ads_ad_signature ON ads(ad_signature);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Create triggers to update ad network stats
CREATE TRIGGER IF NOT EXISTS update_ad_network_stats
  AFTER INSERT ON ads
  FOR EACH ROW
  WHEN NEW.ad_network IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO ad_networks (network_name) VALUES (NEW.ad_network);
  UPDATE ad_networks
  SET total_ads = total_ads + 1,
      last_seen = CURRENT_TIMESTAMP
  WHERE network_name = NEW.ad_network;
END;

-- Create trigger to update session stats
CREATE TRIGGER IF NOT EXISTS update_session_stats
  AFTER INSERT ON ads
  FOR EACH ROW
BEGIN
  UPDATE sessions
  SET total_ads = total_ads + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE session_id = NEW.session_id;
END;