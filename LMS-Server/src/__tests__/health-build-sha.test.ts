/**
 * HEALTH-BUILD-SHA-001: /health response includes buildSha field.
 *
 * The buildSha field allows post-deploy verification that the running
 * container matches the intended commit. It reads from /app/BUILD_SHA
 * (written at Docker build time) and caches the value.
 */

import { describe, it, expect } from 'vitest';
import { getHealthStatus, validateBuildSha } from '../services/healthCheckService.js';

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

  it('HEALTH-BUILD-SHA-004: invalid BUILD_SHA values are sanitized to "unknown"', () => {
    expect(validateBuildSha('')).toBe('unknown');
    expect(validateBuildSha(undefined)).toBe('unknown');
    expect(validateBuildSha('not-a-sha')).toBe('unknown');
    expect(validateBuildSha('abc')).toBe('unknown'); // too short
    expect(validateBuildSha('<script>alert(1)</script>')).toBe('unknown');
  });

  it('HEALTH-BUILD-SHA-005: valid 40-char hex SHA passes validation', () => {
    const sha40 = 'a'.repeat(40);
    expect(validateBuildSha(sha40)).toBe(sha40);
    expect(validateBuildSha('abc123def456789012345678901234567890abcd')).toBe('abc123def456789012345678901234567890abcd');
  });

  it('HEALTH-BUILD-SHA-006: valid 7-char short SHA passes validation', () => {
    expect(validateBuildSha('abc123f')).toBe('abc123f');
    expect(validateBuildSha('0000000')).toBe('0000000');
  });

  it('HEALTH-BUILD-SHA-007: SHA with uppercase, spaces, or metacharacters returns "unknown"', () => {
    expect(validateBuildSha('ABC123F')).toBe('unknown');
    expect(validateBuildSha('abc123f ')).toBe('unknown');
    expect(validateBuildSha(' abc123f')).toBe('unknown');
    expect(validateBuildSha('abc 123')).toBe('unknown');
    expect(validateBuildSha('abc;rm -rf /')).toBe('unknown');
  });
});
