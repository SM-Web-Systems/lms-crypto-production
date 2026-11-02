import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db } from '../config/database.js';
import { engageWriterHold } from '../services/writerHold.js';
import { executeTick } from '../services/rewards/rewardScheduler.js';
import { processEmailRetryQueue } from '../services/emailRetryWorker.js';
import { processExpiredDeletions } from '../services/deletionService.js';

describe('AUTH-14 writer hold worker gates', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-hold-worker-'));
    process.env.WRITER_HOLD_FILE = path.join(dir, '.writer-hold');
    engageWriterHold();
  });
  afterEach(() => {
    delete process.env.WRITER_HOLD_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips reward ticks, email retries and deletion finalization', async () => {
    const logged = () => (db.prepare('SELECT COUNT(*) c FROM scheduler_tick_log').get() as { c: number }).c;
    const before = logged();
    await expect(executeTick()).resolves.toMatchObject({ result: 'skipped' });
    expect(logged()).toBe(before);
    await expect(processEmailRetryQueue()).resolves.toMatchObject({ retried: 0, skipped: 'writer_hold' });
    expect(processExpiredDeletions()).toBe(0);
  });
});
