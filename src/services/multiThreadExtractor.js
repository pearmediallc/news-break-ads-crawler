// Multi-threaded extraction manager
// Runs multiple parallel extraction workers for maximum throughput

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const { URLRotationManager } = require('../config/urlRotation');

class MultiThreadExtractor {
  constructor(config = {}) {
    this.maxWorkers = config.maxWorkers || 5; // Default: 5 parallel workers (increased for better performance)
    this.workers = new Map(); // workerId -> worker info
    this.urlRotation = new URLRotationManager();
    this.sharedSessionId = null;
    this.startTime = null;
    this.totalAds = 0;
    this.isRunning = false;

    // Worker coordination
    this.assignedUrls = new Map(); // workerId -> current URL
    this.workerStats = new Map(); // workerId -> stats

    // Configuration
    this.config = {
      deviceMode: config.deviceMode || 'desktop',
      extractionMode: 'unlimited',
      restartOnFailure: true,
      workerRestartDelay: 3000, // 3 seconds (faster restart)
      sameUrl: config.sameUrl || false, // All workers on same URL
      baseUrl: config.baseUrl || null, // URL to use if sameUrl=true
      ...config
    };
  }

  async initialize() {
    logger.info('🚀 Initializing Multi-Thread Extractor');
    logger.info(`📊 Configuration: ${this.maxWorkers} parallel workers`);

    if (this.config.sameUrl) {
      logger.info(`🔗 Mode: SAME URL - All workers on ${this.config.baseUrl || 'default URL'}`);
    } else {
      logger.info(`🔗 Mode: DIFFERENT URLs - Workers on different cities`);
    }

    this.sharedSessionId = `multi_${Date.now()}`;
    this.startTime = Date.now();

    await fs.ensureDir(path.join(process.cwd(), 'data', 'sessions'));
  }

  async startWorker(workerId) {
    try {
      // Get URL for this worker
      let url;
      if (this.config.sameUrl && this.config.baseUrl) {
        // All workers use the same URL
        url = this.config.baseUrl;
        logger.info(`🔷 Starting Worker #${workerId} on SAME URL: ${url}`);
      } else {
        // Each worker gets a unique URL
        url = this.urlRotation.getNextUrl();
        logger.info(`🔷 Starting Worker #${workerId} on ${url}`);
      }

      const worker = new Worker(path.join(__dirname, 'extractionWorker.js'), {
        workerData: {
          url,
          duration: 0, // Unlimited
          deviceMode: this.config.deviceMode,
          extractionId: `${this.sharedSessionId}_worker${workerId}`,
          extractionMode: 'unlimited',
          workerId: workerId,
          multiThreadMode: true
        }
      });

      const workerInfo = {
        worker,
        workerId,
        url,
        status: 'starting',
        startTime: Date.now(),
        adsExtracted: 0,
        errors: 0,
        logs: []
      };

      this.workers.set(workerId, workerInfo);
      this.assignedUrls.set(workerId, url);

      // Handle worker messages
      worker.on('message', (message) => {
        this.handleWorkerMessage(workerId, message);
      });

      // Handle worker errors
      worker.on('error', (error) => {
        logger.error(`❌ Worker #${workerId} error: ${error.message}`);
        workerInfo.errors++;
        workerInfo.status = 'error';

        if (this.config.restartOnFailure && this.isRunning) {
          this.restartWorker(workerId);
        }
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.warn(`⚠️ Worker #${workerId} exited with code ${code}`);

          if (this.config.restartOnFailure && this.isRunning) {
            this.restartWorker(workerId);
          }
        } else {
          logger.info(`✅ Worker #${workerId} completed successfully`);
        }

        this.workers.delete(workerId);
        this.assignedUrls.delete(workerId);
      });

      return workerInfo;

    } catch (error) {
      logger.error(`Failed to start worker #${workerId}: ${error.message}`);
      throw error;
    }
  }

  async restartWorker(workerId) {
    try {
      logger.info(`🔄 Restarting Worker #${workerId} in ${this.config.workerRestartDelay}ms...`);

      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, this.config.workerRestartDelay));

      // Check if still running
      if (this.isRunning) {
        await this.startWorker(workerId);
      }
    } catch (error) {
      logger.error(`Failed to restart worker #${workerId}: ${error.message}`);
    }
  }

  handleWorkerMessage(workerId, message) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    switch (message.type) {
      case 'log':
        // Store logs but don't flood console
        workerInfo.logs.push({
          timestamp: new Date().toISOString(),
          level: message.data.level,
          message: message.data.message
        });

        // Only keep last 50 logs per worker
        if (workerInfo.logs.length > 50) {
          workerInfo.logs = workerInfo.logs.slice(-50);
        }

        // Log important messages to console with worker ID prefix
        if (message.data.level === 'error' ||
            message.data.level === 'warn' ||
            message.data.message.includes('new ads') ||
            message.data.message.includes('Scan #') ||
            message.data.message.includes('rotating')) {
          logger.info(`[Worker #${workerId}] ${message.data.message}`);
        }
        break;

      case 'ads_update':
        workerInfo.adsExtracted += message.data.newAds?.length || 0;
        this.totalAds += message.data.newAds?.length || 0;

        if (message.data.newAds?.length > 0) {
          logger.info(`✨ Worker #${workerId} found ${message.data.newAds.length} new ads (Total across all workers: ${this.totalAds})`);
        }
        break;

      case 'status_update':
        workerInfo.status = message.data.status || workerInfo.status;
        break;

      case 'session_created':
        workerInfo.sessionFile = message.data.sessionFile;
        break;

      default:
        // Other messages
        break;
    }

    // Update stats
    this.updateWorkerStats(workerId, workerInfo);
  }

  updateWorkerStats(workerId, workerInfo) {
    this.workerStats.set(workerId, {
      workerId,
      url: workerInfo.url,
      status: workerInfo.status,
      adsExtracted: workerInfo.adsExtracted,
      errors: workerInfo.errors,
      uptime: Date.now() - workerInfo.startTime,
      lastUpdate: new Date().toISOString()
    });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Multi-thread extractor already running');
      return;
    }

    this.isRunning = true;
    await this.initialize();

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🚀 MULTI-THREAD EXTRACTION STARTED`);
    logger.info(`📊 Workers: ${this.maxWorkers} parallel threads`);
    logger.info(`📱 Device Mode: ${this.config.deviceMode}`);
    logger.info(`⏱️ Mode: Unlimited (continuous)`);
    logger.info(`${'='.repeat(60)}\n`);

    // Start all workers
    const startPromises = [];
    for (let i = 1; i <= this.maxWorkers; i++) {
      startPromises.push(this.startWorker(i));
    }

    await Promise.all(startPromises);

    // Start monitoring
    this.startMonitoring();

    logger.info(`✅ All ${this.maxWorkers} workers started successfully\n`);
  }

  startMonitoring() {
    // Report stats every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.reportStats();
    }, 30000);

    // URL rotation check every 60 seconds
    this.rotationInterval = setInterval(() => {
      this.checkAndRotateUrls();
    }, 60000);
  }

  async checkAndRotateUrls() {
    // Check if any worker has been on same URL too long without results
    for (const [workerId, stats] of this.workerStats.entries()) {
      const workerInfo = this.workers.get(workerId);
      if (!workerInfo) continue;

      // If worker has been running for 10+ minutes with <10 ads, rotate
      const uptimeMinutes = stats.uptime / (60 * 1000);
      if (uptimeMinutes > 10 && stats.adsExtracted < 10) {
        logger.info(`🔄 Worker #${workerId} seems stuck - triggering URL rotation`);

        // Send rotation message to worker (if supported)
        // For now, we'll restart the worker
        try {
          await workerInfo.worker.terminate();
          await this.restartWorker(workerId);
        } catch (error) {
          logger.error(`Failed to rotate worker #${workerId}: ${error.message}`);
        }
      }
    }
  }

  reportStats() {
    const runtime = Math.floor((Date.now() - this.startTime) / 1000 / 60); // minutes
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.status === 'running').length;

    logger.info(`\n${'─'.repeat(60)}`);
    logger.info(`📊 MULTI-THREAD EXTRACTION STATS`);
    logger.info(`⏱️  Runtime: ${runtime} minutes`);
    logger.info(`👷 Active Workers: ${activeWorkers}/${this.maxWorkers}`);
    logger.info(`📦 Total Ads Extracted: ${this.totalAds}`);
    logger.info(`⚡ Rate: ${(this.totalAds / Math.max(runtime, 1)).toFixed(1)} ads/min`);
    logger.info(`${'─'.repeat(60)}`);

    // Per-worker stats
    for (const [workerId, stats] of this.workerStats.entries()) {
      const uptimeMin = Math.floor(stats.uptime / 1000 / 60);
      logger.info(`  Worker #${workerId}: ${stats.adsExtracted} ads, ${uptimeMin}m uptime, ${stats.status}`);
    }
    logger.info(`${'─'.repeat(60)}\n`);
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('Multi-thread extractor not running');
      return;
    }

    logger.info('🛑 Stopping multi-thread extraction...');
    this.isRunning = false;

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }

    // Terminate all workers
    const terminatePromises = [];
    for (const [workerId, workerInfo] of this.workers.entries()) {
      logger.info(`Terminating Worker #${workerId}...`);
      terminatePromises.push(
        workerInfo.worker.terminate().catch(err =>
          logger.error(`Error terminating worker #${workerId}: ${err.message}`)
        )
      );
    }

    await Promise.all(terminatePromises);

    // Final stats
    this.reportStats();

    logger.info('✅ Multi-thread extraction stopped');
  }

  getStatus() {
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.status === 'running').length;
    const runtime = this.startTime ? Date.now() - this.startTime : 0;

    return {
      isRunning: this.isRunning,
      sessionId: this.sharedSessionId,
      startTime: this.startTime,
      runtime,
      maxWorkers: this.maxWorkers,
      activeWorkers,
      totalAds: this.totalAds,
      workers: Array.from(this.workerStats.values()),
      config: this.config
    };
  }

  // Get logs from specific worker
  getWorkerLogs(workerId, limit = 50) {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return [];

    return workerInfo.logs.slice(-limit);
  }

  // Get all recent logs
  getAllLogs(limit = 100) {
    const allLogs = [];

    for (const [workerId, workerInfo] of this.workers.entries()) {
      const logs = workerInfo.logs.map(log => ({
        ...log,
        workerId
      }));
      allLogs.push(...logs);
    }

    // Sort by timestamp and return latest
    return allLogs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }
}

module.exports = MultiThreadExtractor;
