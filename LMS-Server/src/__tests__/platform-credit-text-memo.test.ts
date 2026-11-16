import { describe, it, expect } from 'vitest';
import { newTextMemo } from '../services/rewards/platformCreditService.js';
import { TEXT_MEMO_PATTERN } from '../services/rewards/stellarFundingVerification.js';
import { db } from '../config/database.js';

describe('backing deposit text memo', () => {
  it('is LMS- plus 12 base32 characters, fits 28 bytes and does not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) { const c = newTextMemo(); expect(TEXT_MEMO_PATTERN.test(c)).toBe(true); expect(Buffer.byteLength(c)).toBeLessThanOrEqual(28); seen.add(c); }
    expect(seen.size).toBe(500);
  });
  it('is stored on backing intents and made unique by the migration', () => {
    const cols = db.prepare('PRAGMA table_info(platform_backing_intents)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('text_memo');
    const idx = db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_backing_intents_text_memo'").get() as { sql: string } | undefined;
    expect(idx?.sql).toMatch(/UNIQUE/i);
  });
});
