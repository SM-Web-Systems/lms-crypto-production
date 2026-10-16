import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { apiURL } from '../playwright.config';

interface AuthFixtures {
  adminPage: Page;
  studentPage: Page;
}

async function getAuthToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await request.post(`${apiURL}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const token = body.data.token;
  expect(token).toBeTruthy();
  return token;
}

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser, baseURL, request }, use) => {
    const token = await getAuthToken(request, 'admin@test.com', 'password123');
    // Set extraHTTPHeaders at context level so page.request inherits the JWT
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'Accept': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.evaluate((t: string) => {
      localStorage.setItem('lms_token', t);
    }, token);
    await use(page);
    await context.close();
  },
  studentPage: async ({ browser, baseURL, request }, use) => {
    const token = await getAuthToken(request, 'student@test.com', 'password123');
    // Set extraHTTPHeaders at context level so page.request inherits the JWT
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'Accept': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.evaluate((t: string) => {
      localStorage.setItem('lms_token', t);
    }, token);
    await use(page);
    await context.close();
  },
});

export { expect };
