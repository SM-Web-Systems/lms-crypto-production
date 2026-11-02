/**
 * Writer hold (AUTH-14) — a file on the database volume that keeps requests,
 * callbacks and internal workers from writing during a release. Refused
 * requests get a retryable 503, so queued work and provider events are kept.
 * The file is read on each check: an unreadable state counts as held.
 */
import fs from 'fs';
import path from 'path';

const HOLD_FILE_NAME = '.writer-hold';
const DEFAULT_POLL_MS = 2_000;

export function writerHoldFilePath(): string {
  if (process.env.WRITER_HOLD_FILE) return process.env.WRITER_HOLD_FILE;
  const databasePath = process.env.DATABASE_PATH || './data/student_ms.db';
  return path.join(path.dirname(path.resolve(databasePath)), HOLD_FILE_NAME);
}

export function isWriterHoldActive(): boolean {
  try {
    fs.statSync(writerHoldFilePath());
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

export function engageWriterHold(): void {
  fs.writeFileSync(writerHoldFilePath(), '', { mode: 0o600 });
}

export function releaseWriterHold(): void {
  fs.rmSync(writerHoldFilePath(), { force: true });
}

/** Run now, or once after release. Used for anything that writes at startup. */
export function runWhenWriterHoldReleased(run: () => void, pollMs: number = DEFAULT_POLL_MS): void {
  if (!isWriterHoldActive()) {
    run();
    return;
  }
  const timer = setInterval(() => {
    if (isWriterHoldActive()) return;
    clearInterval(timer);
    run();
  }, pollMs);
}
