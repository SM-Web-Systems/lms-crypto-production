/**
 * Times from the server. SQLite's datetime('now') gives "2026-11-22 19:00:00": UTC, but with no zone, so
 * `new Date()` reads it as local time (2 hours off in South Africa). Read such a value as UTC; anything that
 * already carries a zone (an ISO "…Z" or "+02:00") is read as is.
 */
export function parseServerTime(value: string | number | Date): Date {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  const s = value.trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(s);
  return new Date(m ? `${m[1]}T${m[2]}Z` : s);
}
