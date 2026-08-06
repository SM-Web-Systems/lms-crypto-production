import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport: !isProd && !isTest
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  enabled: !isTest || process.env.LOG_ENABLED === 'true',
});

export default logger;
