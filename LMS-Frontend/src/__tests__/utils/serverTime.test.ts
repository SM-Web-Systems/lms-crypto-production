import { describe, it, expect } from 'vitest';
import { parseServerTime } from '../../utils/serverTime';

describe('parseServerTime', () => {
  it('reads a SQLite datetime (no zone) as UTC, not local time', () => {
    expect(parseServerTime('2026-11-22 19:00:00').toISOString()).toBe('2026-11-22T19:00:00.000Z');
    expect(parseServerTime('2026-11-22T19:00:00').toISOString()).toBe('2026-11-22T19:00:00.000Z');
    expect(parseServerTime('2026-11-22 19:00:00.250').toISOString()).toBe('2026-11-22T19:00:00.250Z');
  });
  it('keeps a time that already has a zone', () => {
    expect(parseServerTime('2026-11-22T19:00:00.000Z').toISOString()).toBe('2026-11-22T19:00:00.000Z');
    expect(parseServerTime('2026-11-22T21:00:00+02:00').toISOString()).toBe('2026-11-22T19:00:00.000Z');
    expect(parseServerTime(Date.UTC(2026, 10, 22, 19)).toISOString()).toBe('2026-11-22T19:00:00.000Z');
  });
});
