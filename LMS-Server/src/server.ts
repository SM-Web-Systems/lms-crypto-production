import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { db, close } from './config/database.js';
import logger from './utils/logger.js';
import { startScheduler, stopScheduler } from './services/rewards/rewardScheduler.js';
import { startEmailRetryWorker, stopEmailRetryWorker } from './services/emailRetryWorker.js';
import { processExpiredDeletions } from './services/deletionService.js';

const PORT = process.env.PORT || 3001;

let deletionSchedulerInterval: ReturnType<typeof setInterval> | null = null;
const DELETION_SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function startDeletionScheduler() {
  // Run once on startup, then every 24 hours
  try {
    const count = processExpiredDeletions();
    if (count > 0) logger.info({ count }, 'Deletion scheduler: finalized expired accounts on startup');
  } catch (err) {
    logger.error({ err }, 'Deletion scheduler startup run failed');
  }
  deletionSchedulerInterval = setInterval(() => {
    try {
      const count = processExpiredDeletions();
      if (count > 0) logger.info({ count }, 'Deletion scheduler: finalized expired accounts');
    } catch (err) {
      logger.error({ err }, 'Deletion scheduler run failed');
    }
  }, DELETION_SCHEDULER_INTERVAL_MS);
}

function stopDeletionScheduler() {
  if (deletionSchedulerInterval) {
    clearInterval(deletionSchedulerInterval);
    deletionSchedulerInterval = null;
  }
}

function startServer() {
  try {
    // Test database connection
    db.prepare('SELECT 1').get();
    logger.info('Database connected successfully');

    if (!process.env.AMMA_WALLET_URL) {
      logger.warn('AMMA_WALLET_URL not set — wallet provisioning will use localhost fallback (not suitable for production)');
    }
    if (!process.env.AMMA_WALLET_API_KEY && process.env.NODE_ENV === 'production') {
      logger.warn('AMMA_WALLET_API_KEY not set in production — wallet creation will be blocked by Turnstile CAPTCHA');
    }

    app.listen(PORT, () => {
      logger.info({ port: PORT }, `Server is running on http://localhost:${PORT}`);
      logger.info({ port: PORT }, `API base URL: http://localhost:${PORT}/api/v1`);
      logger.info({ env: process.env.NODE_ENV || 'development' }, `Environment: ${process.env.NODE_ENV || 'development'}`);

      // Start reward scheduler for outbox processing + auto-expiry
      startScheduler();
      // Start email retry worker for durable delivery (FIND-027-02)
      startEmailRetryWorker();
      // Start deletion finalization scheduler — runs daily (24h interval)
      startDeletionScheduler();
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
  close();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  stopScheduler();
  stopEmailRetryWorker();
  stopDeletionScheduler();
  close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  stopScheduler();
  stopEmailRetryWorker();
  stopDeletionScheduler();
  close();
  process.exit(0);
});

startServer();
