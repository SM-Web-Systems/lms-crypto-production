import { test, expect } from '../fixtures/auth';

test.describe('Role-based navigation', () => {
  test('admin is routed to /admin', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage).toHaveURL(/\/admin/);
  });

  test('student is routed to /student', async ({ studentPage }) => {
    await studentPage.goto('/student');
    await expect(studentPage).toHaveURL(/\/student/);
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/admin');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
