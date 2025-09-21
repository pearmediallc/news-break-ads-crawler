const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const DatabaseSyncService = require('../database/syncService');

class BackgroundExtractionService {
  constructor() {
    this.activeExtractions = new Map();
    this.dbSync = new DatabaseSyncService();
    this.statusFile = path.join(process.cwd(), 'data', 'extraction_status.json');
    this.sessionsDir = path.join(process.cwd(), 'data', 'sessions');
  }

  async initialize() {
    try {
      await this.dbSync.initialize();
      await this.loadPersistedExtractions();
      logger.info('Background extraction service initialized');
    } catch (error) {
      logger.error('Failed to initialize background extraction service:', error);
      throw error;
    }
  }

  async startExtraction(options) {
    const {
      url,
      duration,
      deviceMode = 'desktop',
      extractionMode = 'timed', // 'timed' or 'unlimited'
      sessionId = null
    } = options;

    const extractionId = sessionId || `extraction_${Date.now()}`;

    try {
      // Create extraction configuration
      const extractionConfig = {
        id: extractionId,
        url,
        duration: extractionMode === 'unlimited' ? null : duration,
        deviceMode,
        extractionMode,
        startTime: new Date().toISOString(),
        status: 'starting',
        pid: null,
        logs: [],
        totalAds: 0,
        sessionFile: null
      };

      // Store extraction info
      this.activeExtractions.set(extractionId, extractionConfig);
      await this.persistExtractionStatus();

      // Create preliminary session pointer for UI to start polling immediately
      const preliminarySessionId = new Date().toISOString().replace(/[:.]/g, '-');
      const preliminarySessionFile = `worker_${preliminarySessionId}.json`;

      try {
        const currentSessionData = {
          sessionFile: preliminarySessionFile,
          timestamp: new Date().toISOString(),
          sessionId: preliminarySessionId,
          status: 'starting'
        };
        await fs.writeJson(
          path.join(process.cwd(), 'data', 'current_session.json'),
          currentSessionData,
          { spaces: 2 }
        );
        logger.info(`Created preliminary session pointer: ${preliminarySessionFile}`);
      } catch (error) {
        logger.warn('Failed to create preliminary session pointer:', error.message);
      }

      // Create worker for background extraction
      const worker = new Worker(path.join(__dirname, 'extractionWorker.js'), {
        workerData: {
          url,
          duration: extractionMode === 'unlimited' ? 0 : duration,
          deviceMode,
          extractionId,
          extractionMode
        }
      });

      extractionConfig.worker = worker;
      extractionConfig.status = 'running';
      extractionConfig.pid = worker.threadId;

      // Handle worker messages
      worker.on('message', async (message) => {
        await this.handleWorkerMessage(extractionId, message);
      });

      // Handle worker error
      worker.on('error', async (error) => {
        logger.error(`Worker error for extraction ${extractionId}:`, error);
        extractionConfig.status = 'error';
        extractionConfig.error = error.message;
        await this.persistExtractionStatus();
      });

      // Handle worker exit
      worker.on('exit', async (code) => {
        if (code !== 0) {
          logger.error(`Worker stopped with exit code ${code}`);
          extractionConfig.status = 'stopped';
        } else {
          extractionConfig.status = 'completed';
        }
        extractionConfig.endTime = new Date().toISOString();
        await this.persistExtractionStatus();
      });

      await this.persistExtractionStatus();

      logger.info(`Started background extraction: ${extractionId}`);
      return {
        extractionId,
        status: 'started',
        config: extractionConfig
      };

    } catch (error) {
      logger.error('Failed to start background extraction:', error);
      throw error;
    }
  }

  async stopExtraction(extractionId) {
    const extraction = this.activeExtractions.get(extractionId);
    if (!extraction) {
      throw new Error(`Extraction not found: ${extractionId}`);
    }

    try {
      if (extraction.worker) {
        // First try to send stop message
        try {
          extraction.worker.postMessage({ type: 'stop' });
          // Give it a moment to clean up gracefully
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          logger.warn(`Could not send stop message: ${e.message}`);
        }

        // Then terminate the worker forcefully
        if (extraction.worker.threadId) {
          await extraction.worker.terminate();
          logger.info(`Terminated worker thread ${extraction.worker.threadId} for extraction ${extractionId}`);
        }
      }

      extraction.status = 'stopped';
      extraction.endTime = new Date().toISOString();

      await this.persistExtractionStatus();

      logger.info(`Stopped extraction: ${extractionId}`);
      return extraction;
    } catch (error) {
      logger.error(`Failed to stop extraction ${extractionId}:`, error);
      throw error;
    }
  }

  async getExtractionStatus(extractionId) {
    if (extractionId) {
      return this.activeExtractions.get(extractionId) || null;
    }

    // Return all extractions
    return Array.from(this.activeExtractions.values());
  }

  async getActiveExtractions() {
    const activeExtractions = Array.from(this.activeExtractions.values())
      .filter(extraction => ['running', 'starting', 'resumable'].includes(extraction.status));

    return activeExtractions;
  }

  async resumeExtraction(extractionId) {
    const extraction = this.activeExtractions.get(extractionId);
    if (!extraction) {
      throw new Error(`Extraction not found: ${extractionId}`);
    }

    if (extraction.status !== 'resumable') {
      throw new Error(`Extraction ${extractionId} is not resumable (status: ${extraction.status})`);
    }

    try {
      logger.info(`🔄 Resuming extraction: ${extractionId}`);

      // Update extraction status
      extraction.status = 'starting';
      extraction.notes = 'Resuming from previous session';
      extraction.resumedAt = new Date().toISOString();

      // Create new worker for the resumed extraction
      const worker = new Worker(path.join(__dirname, 'extractionWorker.js'), {
        workerData: {
          url: extraction.url,
          duration: extraction.extractionMode === 'unlimited' ? 0 : extraction.duration,
          deviceMode: extraction.deviceMode,
          extractionId: extractionId,
          extractionMode: extraction.extractionMode,
          resumeFrom: extraction.sessionFile // Tell worker to resume from existing session
        }
      });

      extraction.worker = worker;
      extraction.status = 'running';
      extraction.pid = worker.threadId;

      // Handle worker messages
      worker.on('message', async (message) => {
        await this.handleWorkerMessage(extractionId, message);
      });

      // Handle worker error
      worker.on('error', async (error) => {
        logger.error(`Worker error for resumed extraction ${extractionId}:`, error);
        extraction.status = 'error';
        extraction.error = error.message;
        await this.persistExtractionStatus();
      });

      // Handle worker exit
      worker.on('exit', async (code) => {
        if (code !== 0) {
          logger.error(`Resumed worker stopped with exit code ${code}`);
          extraction.status = 'stopped';
        } else {
          extraction.status = 'completed';
        }
        extraction.endTime = new Date().toISOString();
        await this.persistExtractionStatus();
      });

      await this.persistExtractionStatus();

      logger.info(`✅ Resumed extraction: ${extractionId}`);
      return {
        extractionId,
        status: 'resumed',
        config: extraction
      };

    } catch (error) {
      logger.error('Failed to resume extraction:', error);
      extraction.status = 'error';
      extraction.error = error.message;
      await this.persistExtractionStatus();
      throw error;
    }
  }

  async handleWorkerMessage(extractionId, message) {
    const extraction = this.activeExtractions.get(extractionId);
    if (!extraction) return;

    const { type, data } = message;

    switch (type) {
      case 'log':
        extraction.logs.push({
          timestamp: new Date().toISOString(),
          message: data.message,
          level: data.level || 'info'
        });

        // Keep only last 100 logs to prevent memory bloat
        if (extraction.logs.length > 100) {
          extraction.logs = extraction.logs.slice(-100);
        }
        break;

      case 'ads_update':
        extraction.totalAds = data.totalAds;
        extraction.latestAds = data.latestAds;

        // Sync to database only if session exists
        try {
          if (data.newAds && data.newAds.length > 0 && extraction.sessionId) {
            await this.dbSync.syncAds(data.newAds, extraction.sessionId);
          }
        } catch (error) {
          logger.warn('Failed to sync ads to database:', error.message);
        }
        break;

      case 'session_created':
        extraction.sessionFile = data.sessionFile;
        extraction.sessionId = data.sessionId;

        // Update current session pointer for UI with actual session info
        try {
          const currentSessionData = {
            sessionFile: data.sessionFile,
            timestamp: new Date().toISOString(),
            sessionId: data.sessionId,
            status: 'active'
          };
          await fs.writeJson(
            path.join(process.cwd(), 'data', 'current_session.json'),
            currentSessionData,
            { spaces: 2 }
          );
          logger.info(`Updated current session pointer to: ${data.sessionFile}`);
        } catch (error) {
          logger.warn('Failed to update current session pointer:', error.message);
        }

        // Sync session to database
        try {
          await this.dbSync.syncSession({
            sessionId: data.sessionId,
            startTime: extraction.startTime,
            url: extraction.url,
            duration: extraction.duration,
            deviceMode: extraction.deviceMode,
            file: data.sessionFile
          });
        } catch (error) {
          logger.warn('Failed to sync session to database:', error.message);
        }
        break;

      case 'status_update':
        extraction.status = data.status;
        if (data.progress) {
          extraction.progress = data.progress;
        }
        break;

      case 'error':
        extraction.status = 'error';
        extraction.error = data.message;
        logger.error(`Extraction ${extractionId} error:`, data.message);
        break;
    }

    await this.persistExtractionStatus();
  }

  async persistExtractionStatus() {
    try {
      const extractionsData = {};
      for (const [id, extraction] of this.activeExtractions) {
        // Don't serialize the worker object
        const { worker, ...extractionData } = extraction;
        extractionsData[id] = extractionData;
      }

      await fs.writeJson(this.statusFile, {
        timestamp: new Date().toISOString(),
        extractions: extractionsData
      }, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to persist extraction status:', error);
    }
  }

  async loadPersistedExtractions() {
    try {
      if (await fs.exists(this.statusFile)) {
        const statusData = await fs.readJson(this.statusFile);

        for (const [id, extraction] of Object.entries(statusData.extractions || {})) {
          // Check if this extraction was running when server stopped
          if (['running', 'starting'].includes(extraction.status)) {
            // Check if the session file still exists and has been recently updated
            const sessionFile = extraction.sessionFile;
            if (sessionFile) {
              const sessionPath = path.join(this.sessionsDir, sessionFile);
              try {
                const sessionStats = await fs.stat(sessionPath);
                const now = new Date();
                const sessionModified = new Date(sessionStats.mtime);
                const timeDiff = now - sessionModified;

                // For unlimited mode, use longer window (15 minutes)
                const maxIdleTime = extraction.extractionMode === 'unlimited' ? 15 * 60 * 1000 : 5 * 60 * 1000;

                if (timeDiff < maxIdleTime) {
                  // Mark as resumable instead of running
                  extraction.status = 'resumable';
                  extraction.notes = 'Available for resumption - browser closed but session preserved';
                  extraction.canResume = true;
                  extraction.resumeData = {
                    lastActivity: sessionStats.mtime,
                    idleTime: timeDiff
                  };
                  logger.info(`🔄 Found resumable extraction: ${id} (idle for ${Math.round(timeDiff/1000)}s)`);
                } else {
                  extraction.status = 'stopped';
                  extraction.endTime = new Date().toISOString();
                  extraction.notes = 'Stopped due to inactivity';
                }
              } catch (error) {
                // Session file doesn't exist or can't read it
                extraction.status = 'stopped';
                extraction.endTime = new Date().toISOString();
                extraction.notes = 'Session file missing';
                logger.warn(`Session file missing for extraction ${id}: ${error.message}`);
              }
            } else {
              extraction.status = 'stopped';
              extraction.endTime = new Date().toISOString();
              extraction.notes = 'No session file found';
            }
          }

          this.activeExtractions.set(id, extraction);
        }

        logger.info(`Loaded ${this.activeExtractions.size} persisted extractions`);
      }
    } catch (error) {
      logger.warn('Failed to load persisted extractions:', error.message);
    }
  }

  async cleanup() {
    // Stop all active workers
    for (const extraction of this.activeExtractions.values()) {
      if (extraction.worker && extraction.status === 'running') {
        try {
          await extraction.worker.terminate();
        } catch (error) {
          logger.warn(`Failed to terminate worker: ${error.message}`);
        }
      }
    }

    if (this.dbSync) {
      await this.dbSync.close();
    }
  }
}

module.exports = BackgroundExtractionService;