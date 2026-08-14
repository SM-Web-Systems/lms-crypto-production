import { test, expect } from '@playwright/test';

test.describe('Admin login flow', () => {
  test('admin can log in via the admin form', async ({ page }) => {
    await page.goto('/login');

    // Expand the admin login form
    await page.getByRole('button', { name: /administrator sign in/i }).click();

    // Fill in credentials
    await page.getByLabel(/email/i).fill('admin@test.com');
    await page.locator('#password').fill('password123');

    // Submit the form
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  });

  test('login rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /administrator sign in/i }).click();
    await page.getByLabel(/email/i).fill('admin@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Should show an error message
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5_000 });
  });
});
