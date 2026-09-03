/**
 * HEALTH-BUILD-SHA-001: /health response includes buildSha field.
 *
 * The buildSha field allows post-deploy verification that the running
 * container matches the intended commit. It reads from /app/BUILD_SHA
 * (written at Docker build time) and caches the value.
 */

import { describe, it, expect } from 'vitest';
import { getHealthStatus } from '../services/healthCheckService.js';

describe('HEALTH-BUILD-SHA — health endpoint includes build SHA', () => {
  it('HEALTH-BUILD-SHA-001: getHealthStatus() includes a buildSha field', () => {
    const health = getHealthStatus();
    expect(health).toHaveProperty('buildSha');
    expect(typeof health.buildSha).toBe('string');
    expect(health.buildSha.length).toBeGreaterThan(0);
  });

  it('HEALTH-BUILD-SHA-002: buildSha is "unknown" when BUILD_SHA file is absent (dev/test)', () => {
    // In test environment there's no BUILD_SHA file, so it should fall back to "unknown"
    const health = getHealthStatus();
    expect(health.buildSha).toBe('unknown');
  });

  it('HEALTH-BUILD-SHA-003: health response includes all required fields', () => {
    const health = getHealthStatus();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('timestamp');
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('version');
    expect(health).toHaveProperty('buildSha');
    expect(health).toHaveProperty('checks');
    expect(health.checks).toHaveProperty('db');
    expect(health.checks).toHaveProperty('memory');
  });
});
