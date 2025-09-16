// src/storage/models.js
const { Sequelize, DataTypes } = require('sequelize');
const config = require('../utils/config');

const sequelize = new Sequelize(
  config.database.database,
  config.database.username, 
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging
  }
);

// Crawl Sessions Model
const CrawlSession = sequelize.define('CrawlSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sessionName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  startTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  endTime: {
    type: DataTypes.DATE
  },
  duration: {
    type: DataTypes.INTEGER // seconds
  },
  status: {
    type: DataTypes.ENUM('running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'running'
  },
  totalAds: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalMedia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  archivePath: {
    type: DataTypes.STRING
  },
  settings: {
    type: DataTypes.JSON
  }
});

// Extracted Ads Model
const ExtractedAd = sequelize.define('ExtractedAd', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.UUID,
    references: { model: CrawlSession, key: 'id' }
  },
  adId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  adType: {
    type: DataTypes.ENUM('native', 'display', 'video', 'iframe'),
    allowNull: false
  },
  selector: {
    type: DataTypes.STRING
  },
  content: {
    type: DataTypes.JSON
  },
  position: {
    type: DataTypes.JSON
  },
  media: {
    type: DataTypes.JSON
  },
  extractedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Downloaded Media Model
const DownloadedMedia = sequelize.define('DownloadedMedia', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.UUID,
    references: { model: CrawlSession, key: 'id' }
  },
  adId: {
    type: DataTypes.STRING
  },
  mediaType: {
    type: DataTypes.ENUM('image', 'video', 'audio', 'other')
  },
  originalUrl: {
    type: DataTypes.TEXT
  },
  fileName: {
    type: DataTypes.STRING
  },
  filePath: {
    type: DataTypes.TEXT
  },
  fileSize: {
    type: DataTypes.INTEGER
  },
  contentType: {
    type: DataTypes.STRING
  },
  downloadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Network Requests Model
const NetworkRequest = sequelize.define('NetworkRequest', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.UUID,
    references: { model: CrawlSession, key: 'id' }
  },
  url: {
    type: DataTypes.TEXT
  },
  method: {
    type: DataTypes.STRING
  },
  resourceType: {
    type: DataTypes.STRING
  },
  status: {
    type: DataTypes.INTEGER
  },
  requestHeaders: {
    type: DataTypes.JSON
  },
  responseHeaders: {
    type: DataTypes.JSON
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Define associations
CrawlSession.hasMany(ExtractedAd, { foreignKey: 'sessionId' });
CrawlSession.hasMany(DownloadedMedia, { foreignKey: 'sessionId' });
CrawlSession.hasMany(NetworkRequest, { foreignKey: 'sessionId' });

ExtractedAd.belongsTo(CrawlSession, { foreignKey: 'sessionId' });
DownloadedMedia.belongsTo(CrawlSession, { foreignKey: 'sessionId' });
NetworkRequest.belongsTo(CrawlSession, { foreignKey: 'sessionId' });

module.exports = {
  sequelize,
  CrawlSession,
  ExtractedAd, 
  DownloadedMedia,
  NetworkRequest
};