import { test, expect } from '../fixtures/auth';

test.describe('Admin dashboard', () => {
  test('admin sees the dashboard after login', async ({ adminPage }) => {
    // This is the first browser test in the run. Wait on the signals that matter, not on any text matching
    // /dashboard/i: the session check that decides whether the app shows its layout at all, then the
    // admin navigation, which renders as soon as the session is known (the page heading waits on the
    // student and submission counts). The app's own request timeout is 15 s, so allow that much.
    const me = adminPage.waitForResponse(r => r.url().includes('/api/v1/auth/me'), { timeout: 20_000 });
    await adminPage.goto('/admin');
    expect((await me).ok()).toBeTruthy();

    const nav = adminPage.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('admin can navigate to students page', async ({ adminPage }) => {
    await adminPage.goto('/admin/students');

    // Students page should render
    await expect(adminPage).toHaveURL(/\/admin\/students/);
  });
});
