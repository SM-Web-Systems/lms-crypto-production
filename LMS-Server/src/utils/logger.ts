import pino from 'pino';
import { createRequire } from 'node:module';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// pino-pretty is a dev dependency and is not in the runtime image; fall back to JSON logs without it.
function prettyAvailable(): boolean {
  try { createRequire(import.meta.url).resolve('pino-pretty'); return true; } catch { return false; }
}

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport: !isProd && !isTest && prettyAvailable()
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  enabled: !isTest || process.env.LOG_ENABLED === 'true',
});

export default logger;
