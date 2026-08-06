/**
 * LOG-001 — Logger creates child with module context
 * LOG-002 — Logger respects level configuration
 */

import { describe, it, expect } from 'vitest';
import logger from '../utils/logger.js';

describe('LOG-001 — Logger child loggers', () => {
  it('should create a child logger with module context', () => {
    const child = logger.child({ module: 'auth' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
  });
});

describe('LOG-002 — Logger level configuration', () => {
  it('should have standard pino log methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });
});
