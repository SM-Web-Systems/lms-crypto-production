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
  // Production always follows the database: an override could silently unhold it.
  if (process.env.VITEST && process.env.WRITER_HOLD_FILE) return process.env.WRITER_HOLD_FILE;
  const databasePath = process.env.DATABASE_PATH || './data/student_ms.db';
  return path.join(path.dirname(path.resolve(databasePath)), HOLD_FILE_NAME);
}

export function isWriterHoldActive(): boolean {
  const file = writerHoldFilePath();
  try {
    // Any marker, including a dangling symlink, means held.
    fs.lstatSync(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return true;
  }

  // Windows also reports ENOENT when a parent component is a regular file.
  // Absence is safe only beneath the expected, existing database directory.
  try {
    if (!fs.statSync(path.dirname(file)).isDirectory()) return true;
  } catch { return true; }

  // Recheck after inspecting the directory, in case a marker appeared meanwhile.
  // This is a point-in-time guard, not a lock/drain for in-flight requests.
  try { fs.lstatSync(file); return true; }
  catch (err) { return (err as NodeJS.ErrnoException).code !== 'ENOENT'; }
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
