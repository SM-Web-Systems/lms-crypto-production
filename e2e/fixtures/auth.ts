import { test as base, expect, type Page } from '@playwright/test';
import { apiURL } from '../playwright.config';

interface AuthFixtures {
  adminPage: Page;
  studentPage: Page;
}

async function loginViaAPI(
  page: Page,
  email: string,
  password: string,
  baseURL: string,
): Promise<void> {
  // Hit the login API directly to get a JWT
  const response = await page.request.post(`${apiURL}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const token = body.data.token;
  expect(token).toBeTruthy();

  // Inject the token into localStorage before navigating
  await page.goto(baseURL);
  await page.evaluate((t: string) => {
    localStorage.setItem('lms_token', t);
  }, token);
}

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page, baseURL }, use) => {
    await loginViaAPI(page, 'admin@test.com', 'password123', baseURL!);
    await use(page);
  },
  studentPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginViaAPI(page, 'student@test.com', 'password123', baseURL!);
    await use(page);
    await context.close();
  },
});

export { expect };
