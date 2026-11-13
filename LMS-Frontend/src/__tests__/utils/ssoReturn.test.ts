import { describe, it, expect, beforeEach } from 'vitest';
import { rememberSsoReturn, takeSsoReturn } from '../../utils/ssoReturn';

beforeEach(() => sessionStorage.clear());

describe('ssoReturn', () => {
  it('returns a remembered profile path once', () => {
    rememberSsoReturn('/student/profile', 1000);
    expect(takeSsoReturn(2000)).toBe('/student/profile');
    expect(takeSsoReturn(2000)).toBeNull();
  });
  it('ignores stale entries', () => {
    rememberSsoReturn('/admin/profile', 0);
    expect(takeSsoReturn(16 * 60 * 1000)).toBeNull();
  });
  it.each(['//evil.example/profile', 'https://evil.example/profile', '/admin/users', '/profile?x=1'])('refuses %s', (path) => {
    rememberSsoReturn(path, 1000);
    expect(takeSsoReturn(2000)).toBeNull();
  });
});
