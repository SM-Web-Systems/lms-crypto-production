import { isStorageFull } from '@/utils/storageErrors';

describe('isStorageFull', () => {
  it.each([
    'database or disk is full (code 13 SQLITE_FULL)',
    'ENOSPC: no space left on device',
    'Storage is full.',
  ])('recognises %s', (message) => expect(isStorageFull(new Error(message))).toBe(true));
  it('looks at the cause of a wrapped error', () => {
    expect(isStorageFull(new Error('Could not save', { cause: new Error('SQLITE_FULL') }))).toBe(true);
  });
  it('ignores other failures', () => {
    expect(isStorageFull(new Error('Network request failed'))).toBe(false);
    expect(isStorageFull(undefined)).toBe(false);
  });
});
