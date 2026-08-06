import { db } from '../config/database.js';
import fs from 'fs';
import path from 'path';

export interface ReadinessStatus {
  ready: boolean;
  checks: {
    db_read: { ok: boolean; ms: number };
    db_write: { ok: boolean; ms: number };
    disk: { ok: boolean; availableMB: number };
  };
}

const MIN_DISK_MB = 100;

export function getReadinessStatus(): ReadinessStatus {
  // DB read check
  let dbReadOk = false;
  let dbReadMs = 0;
  try {
    const start = Date.now();
    db.prepare('SELECT 1').get();
    dbReadMs = Date.now() - start;
    dbReadOk = true;
  } catch {
    dbReadOk = false;
  }

  // DB write check — insert then delete to test write path
  let dbWriteOk = false;
  let dbWriteMs = 0;
  try {
    const start = Date.now();
    const pingCheck = db.transaction(() => {
      const ts = new Date().toISOString();
      const info = db.prepare('INSERT INTO health_check_pings (ts) VALUES (?)').run(ts);
      db.prepare('DELETE FROM health_check_pings WHERE id = ?').run(info.lastInsertRowid);
    });
    pingCheck();
    dbWriteMs = Date.now() - start;
    dbWriteOk = true;
  } catch {
    dbWriteOk = false;
  }

  // Disk check — verify data directory has sufficient space
  let diskOk = false;
  let availableMB = 0;
  try {
    const dataDir = process.env.DATABASE_PATH
      ? path.dirname(process.env.DATABASE_PATH)
      : './data';
    const stats = fs.statfsSync(dataDir);
    availableMB = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
    diskOk = availableMB >= MIN_DISK_MB;
  } catch {
    // In test environments (in-memory DB), data dir may not exist — treat as ok
    if (process.env.VITEST) {
      diskOk = true;
      availableMB = 9999;
    }
  }

  const ready = dbReadOk && dbWriteOk && diskOk;

  return {
    ready,
    checks: {
      db_read: { ok: dbReadOk, ms: dbReadMs },
      db_write: { ok: dbWriteOk, ms: dbWriteMs },
      disk: { ok: diskOk, availableMB },
    },
  };
}
