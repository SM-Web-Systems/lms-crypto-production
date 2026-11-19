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

test.describe('Session cookie (audit 2026-11 S2)', () => {
  test('web sign-in keeps the token in an HttpOnly cookie, and survives reload', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /administrator sign in/i }).click();
    await page.getByLabel(/email/i).fill('admin@test.com');
    await page.locator('#password').fill('password123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });

    const session = (await context.cookies()).find(c => c.name === 'lms_session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain(session!.value);
    expect(stored).not.toMatch(/eyJ[\w-]+\.[\w-]+\./); // no JWT anywhere in page-readable storage
    expect(await page.evaluate(() => document.cookie)).not.toContain('lms_session');

    await page.reload();
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /administrator sign in/i })).toHaveCount(0);
  });
});
