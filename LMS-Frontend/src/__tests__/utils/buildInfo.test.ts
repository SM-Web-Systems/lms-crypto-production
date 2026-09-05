import { describe, it, expect } from 'vitest';
import { validateBuildSha, getShortSha } from '../../utils/buildInfo';

describe('buildInfo utilities', () => {
  it('BUILD-FE-1: validateBuildSha returns valid SHA unchanged', () => {
    expect(validateBuildSha('abc123f')).toBe('abc123f');
    expect(validateBuildSha('a'.repeat(40))).toBe('a'.repeat(40));
    expect(validateBuildSha('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123456789abcdef0123456789abcdef01234567',
    );
  });

  it('BUILD-FE-2: validateBuildSha returns "unknown" for undefined', () => {
    expect(validateBuildSha(undefined)).toBe('unknown');
  });

  it('BUILD-FE-3: validateBuildSha returns "unknown" for invalid input', () => {
    expect(validateBuildSha('')).toBe('unknown');
    expect(validateBuildSha('not-hex')).toBe('unknown');
    expect(validateBuildSha('ABC123F')).toBe('unknown');
    expect(validateBuildSha('abc')).toBe('unknown');
    expect(validateBuildSha('<script>')).toBe('unknown');
  });

  it('BUILD-FE-4: getShortSha returns first 7 chars of full SHA', () => {
    expect(getShortSha('abc123f0000000000000000000000000deadbeef')).toBe('abc123f');
    expect(getShortSha('abc123f')).toBe('abc123f');
    expect(getShortSha('unknown')).toBe('unknown');
  });
});
