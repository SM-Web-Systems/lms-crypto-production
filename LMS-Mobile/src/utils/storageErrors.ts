export const STORAGE_FULL_MESSAGE = 'Your device is out of storage. Free up some space, then try again.';

const storageFull = /SQLITE_FULL|disk is full|no space left|ENOSPC|storage is full|out of storage/i;

/** True when an error (or its cause) says the device ran out of space. */
export function isStorageFull(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    const message = current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    if (storageFull.test(message)) return true;
    current = current instanceof Error ? (current as Error & {cause?: unknown}).cause : undefined;
  }
  return false;
}
