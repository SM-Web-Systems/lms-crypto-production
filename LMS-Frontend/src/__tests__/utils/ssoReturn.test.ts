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
  it.each([
    '/student/rewards',
    '/student/course?course=c-1',
    '/student/rewards/claim#claim=abc&signature=a%2Bb%3D',
    '/admin/users',
    '/sponsor/rewards',
    '/settings/notifications',
    '/messages',
  ])('keeps the in-app deep link %s', (path) => {
    rememberSsoReturn(path, 1000);
    expect(takeSsoReturn(2000)).toBe(path);
  });
  it.each([
    '//evil.example/profile',
    'https://evil.example/student',
    '/\\evil.example/student',
    '/student\\..\\..\\evil',
    'student/profile',
    '/login',
    '/sso-callback#token=x',
    '/verify/abc',
    '/',
    '/studentx/profile',
    '/student/../login',
    '/student/%2e%2e/login',
    'javascript:alert(1)',
    '/student\nprofile',
  ])('refuses %s', (path) => {
    rememberSsoReturn(path, 1000);
    expect(takeSsoReturn(2000)).toBeNull();
  });
  it('refuses a tampered stored value', () => {
    sessionStorage.setItem('lms.sso.returnTo', JSON.stringify({ path: '//evil.example', at: 1000 }));
    expect(takeSsoReturn(2000)).toBeNull();
  });
});
