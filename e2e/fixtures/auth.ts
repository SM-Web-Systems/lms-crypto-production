import { test as base, expect, type Page, type Browser, type BrowserContext, type APIRequestContext } from '@playwright/test';
import { apiURL } from '../playwright.config';

interface AuthFixtures {
  adminPage: Page;
  superAdminPage: Page;
  studentPage: Page;
  sponsorAPage: Page;
  sponsorBPage: Page;
  reportingSponsorPage: Page;
}

async function getAuthToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await request.post(`${apiURL}/api/v1/auth/login`, { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.data.token).toBeTruthy();
  return body.data.token;
}

// All browser traffic is confined to the disposable fixture services. External
// fonts/providers must not decide whether an unrelated UI navigation times out.
async function restrictFixtureNetwork(context: BrowserContext, baseURL: string) {
  const origins = new Set([new URL(baseURL).origin, new URL(apiURL).origin]);
  await context.route('**/*', route => origins.has(new URL(route.request().url()).origin)
    ? route.continue() : route.abort('blockedbyclient'));
}

interface FixtureServices {
  browser: Browser;
  baseURL: string | undefined;
  request: APIRequestContext;
}

function authenticatedPage(email: string) {
  return async ({ browser, baseURL, request }: FixtureServices, use: (page: Page) => Promise<void>) => {
    if (!baseURL) throw new Error('Fixture base URL required');
    const token = await getAuthToken(request, email, 'password123');
    const context = await browser.newContext({
      baseURL,
      serviceWorkers: 'block',
      // Let each engine negotiate HTML for document navigation. Forcing JSON
      // here makes Vite's SPA fallback return 404 to Firefox deep links.
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
      // Exact-origin storage is present on the first real navigation. There is
      // no preliminary landing-page load and no init script that can restore a
      // logged-out token or put it in a third-party frame's storage.
      storageState: {
        cookies: [],
        origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'lms_token', value: token }] }],
      },
    });
    try {
      await restrictFixtureNetwork(context, baseURL);
      await use(await context.newPage());
    } finally { await context.close(); }
  };
}

export const test = base.extend<AuthFixtures>({
  context: async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('Fixture base URL required');
    await restrictFixtureNetwork(context, baseURL);
    await use(context);
  },
  adminPage: authenticatedPage('admin@test.com'),
  superAdminPage: authenticatedPage('superadmin@test.com'),
  studentPage: authenticatedPage('student@test.com'),
  sponsorAPage: authenticatedPage('sponsor-a@test.com'),
  sponsorBPage: authenticatedPage('sponsor-b@test.com'),
  reportingSponsorPage: authenticatedPage('sponsor-reporting@test.com'),
});

export { expect };
