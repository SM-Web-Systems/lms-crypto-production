import { test, expect } from '../fixtures/auth';

test.describe('Admin dashboard', () => {
  test('admin sees the dashboard after login', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    // Dashboard should load with key elements
    await expect(adminPage.getByText(/dashboard/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin can navigate to students page', async ({ adminPage }) => {
    await adminPage.goto('/admin/students');

    // Students page should render
    await expect(adminPage).toHaveURL(/\/admin\/students/);
  });
});
