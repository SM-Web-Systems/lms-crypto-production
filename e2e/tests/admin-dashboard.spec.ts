import { test, expect } from '../fixtures/auth';

test.describe('Admin dashboard', () => {
  test('admin sees the dashboard after login', async ({ adminPage }, testInfo) => {
    // This is the first browser test in the run. Wait on the signals that matter, not on any text matching
    // /dashboard/i: the session check that decides whether the app shows its layout at all, then the
    // admin navigation, which renders as soon as the session is known (the page heading waits on the
    // student and submission counts). The app's own request timeout is 15 s, so allow that much.
    const authCalls: string[] = [];
    adminPage.on('response', r => { if (r.url().includes('/api/v1/auth/')) authCalls.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    adminPage.on('requestfailed', r => { if (r.url().includes('/api/v1/auth/')) authCalls.push(`failed ${new URL(r.url()).pathname}: ${r.failure()?.errorText}`); });
    try {
      const me = adminPage.waitForResponse(r => r.url().includes('/api/v1/auth/me'), { timeout: 20_000 });
      await adminPage.goto('/admin');
      expect((await me).ok()).toBeTruthy();
      const nav = adminPage.getByRole('navigation', { name: 'Main navigation' });
      await expect(nav.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    } catch (error) {
      // Evidence for the intermittent CI failure: what the auth calls returned and what the page showed.
      const body = await adminPage.locator('body').innerText().catch(() => '(no body)');
      await testInfo.attach('diagnostics', { body: `auth calls:\n${authCalls.join('\n')}\n\npage text:\n${body.slice(0, 2000)}`, contentType: 'text/plain' });
      console.log(`[admin-dashboard] auth calls: ${authCalls.join(' | ')} | page text: ${body.slice(0, 500).replace(/\s+/g, ' ')}`);
      throw error;
    }
  });

  test('admin can navigate to students page', async ({ adminPage }) => {
    await adminPage.goto('/admin/students');

    // Students page should render
    await expect(adminPage).toHaveURL(/\/admin\/students/);
  });
});
