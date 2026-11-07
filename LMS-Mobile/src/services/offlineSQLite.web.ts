export function offlineSQLite(): never {
  throw new Error('Encrypted offline storage is available in the native LMS app.');
}
