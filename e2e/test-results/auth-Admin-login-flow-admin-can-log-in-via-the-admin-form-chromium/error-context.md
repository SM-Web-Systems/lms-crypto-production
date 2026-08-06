# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Admin login flow >> admin can log in via the admin form
- Location: tests/auth.spec.ts:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/email/i)

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img "SM Web Systems" [ref=e6]
    - heading "SM Web Systems" [level=1] [ref=e7]
    - paragraph [ref=e8]: Learning Management System
  - generic [ref=e9]:
    - generic [ref=e10]:
      - heading "Welcome back" [level=2] [ref=e11]
      - paragraph [ref=e12]: Sign in with your AmmaWallet account to continue.
    - link "Sign in with AmmaWallet" [ref=e13] [cursor=pointer]:
      - /url: /api/v1/auth/amma-login
    - paragraph [ref=e18]:
      - text: Don't have an account?
      - link "Create one on AmmaWallet" [ref=e19] [cursor=pointer]:
        - /url: https://ammawallet.com/register
    - generic [ref=e20]:
      - button "Administrator sign in" [active] [ref=e21] [cursor=pointer]
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]: Email
          - textbox "Email" [ref=e31]:
            - /placeholder: you@example.com
        - generic [ref=e32]:
          - generic [ref=e33]:
            - generic [ref=e34]: Password
            - link "Forgot password?" [ref=e35] [cursor=pointer]:
              - /url: /forgot-password
          - generic [ref=e36]:
            - textbox "Password" [ref=e40]:
              - /placeholder: ••••••••
            - button "Show password" [ref=e41] [cursor=pointer]
        - button "Sign in" [ref=e45] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Admin login flow', () => {
  4  |   test('admin can log in via the admin form', async ({ page }) => {
  5  |     await page.goto('/login');
  6  | 
  7  |     // Expand the admin login form
  8  |     await page.getByRole('button', { name: /administrator sign in/i }).click();
  9  | 
  10 |     // Fill in credentials
> 11 |     await page.getByPlaceholder(/email/i).fill('admin@test.com');
     |                                           ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  12 |     await page.getByPlaceholder(/password/i).fill('password123');
  13 | 
  14 |     // Submit the form
  15 |     await page.getByRole('button', { name: /sign in/i }).click();
  16 | 
  17 |     // Should redirect to admin dashboard
  18 |     await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  19 |   });
  20 | 
  21 |   test('login rejects invalid credentials', async ({ page }) => {
  22 |     await page.goto('/login');
  23 | 
  24 |     await page.getByRole('button', { name: /administrator sign in/i }).click();
  25 |     await page.getByPlaceholder(/email/i).fill('admin@test.com');
  26 |     await page.getByPlaceholder(/password/i).fill('wrongpassword');
  27 |     await page.getByRole('button', { name: /sign in/i }).click();
  28 | 
  29 |     // Should show an error message
  30 |     await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5_000 });
  31 |   });
  32 | });
  33 | 
```