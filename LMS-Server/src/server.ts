import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { db, close } from './config/database.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 3001;

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
  close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  close();
  process.exit(0);
});

startServer();
