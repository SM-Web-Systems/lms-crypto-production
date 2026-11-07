import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db } from '../config/database.js';
import { engageWriterHold, releaseWriterHold } from '../services/writerHold.js';
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
    db.prepare(`INSERT INTO users (id, email, name, password_hash, deletion_status)
      VALUES ('held-user', 'held@test.example', 'Held', 'x', 'pending_deletion')`).run();
    db.prepare(`INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
      VALUES ('held-request', 'held-user', 'pending', datetime('now', '-1 day'))`).run();
    expect(processExpiredDeletions()).toBe(0);
    expect(db.prepare("SELECT status FROM deletion_requests WHERE id = 'held-request'").get()).toEqual({ status: 'pending' });
    releaseWriterHold();
    processExpiredDeletions();
    expect(db.prepare("SELECT status FROM deletion_requests WHERE id = 'held-request'").get()).not.toEqual({ status: 'pending' });
  });
});
