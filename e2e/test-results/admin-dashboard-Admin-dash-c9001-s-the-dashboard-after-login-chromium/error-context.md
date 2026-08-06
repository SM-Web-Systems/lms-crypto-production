# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-dashboard.spec.ts >> Admin dashboard >> admin sees the dashboard after login
- Location: tests/admin-dashboard.spec.ts:4:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { test as base, expect, type Page } from '@playwright/test';
  2  | import { apiURL } from '../playwright.config';
  3  | 
  4  | interface AuthFixtures {
  5  |   adminPage: Page;
  6  |   studentPage: Page;
  7  | }
  8  | 
  9  | async function loginViaAPI(
  10 |   page: Page,
  11 |   email: string,
  12 |   password: string,
  13 |   baseURL: string,
  14 | ): Promise<void> {
  15 |   // Hit the login API directly to get a JWT
  16 |   const response = await page.request.post(`${apiURL}/api/v1/auth/login`, {
  17 |     data: { email, password },
  18 |   });
> 19 |   expect(response.ok()).toBeTruthy();
     |                         ^ Error: expect(received).toBeTruthy()
  20 |   const body = await response.json();
  21 |   const token = body.data.token;
  22 |   expect(token).toBeTruthy();
  23 | 
  24 |   // Inject the token into localStorage before navigating
  25 |   await page.goto(baseURL);
  26 |   await page.evaluate((t: string) => {
  27 |     localStorage.setItem('lms_token', t);
  28 |   }, token);
  29 | }
  30 | 
  31 | export const test = base.extend<AuthFixtures>({
  32 |   adminPage: async ({ page, baseURL }, use) => {
  33 |     await loginViaAPI(page, 'admin@test.com', 'password123', baseURL!);
  34 |     await use(page);
  35 |   },
  36 |   studentPage: async ({ browser, baseURL }, use) => {
  37 |     const context = await browser.newContext();
  38 |     const page = await context.newPage();
  39 |     await loginViaAPI(page, 'student@test.com', 'password123', baseURL!);
  40 |     await use(page);
  41 |     await context.close();
  42 |   },
  43 | });
  44 | 
  45 | export { expect };
  46 | 
```