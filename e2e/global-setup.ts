/**
 * Playwright global setup — seeds E2E test users via the registration API.
 * Runs once before all test files.  Idempotent: 409 (duplicate) is ignored.
 */

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

interface TestUser {
  name: string;
  email: string;
  password: string;
}

const USERS: TestUser[] = [
  { name: 'E2E Admin', email: 'admin@test.com', password: 'password123' },
  { name: 'E2E Student', email: 'student@test.com', password: 'password123' },
];

async function globalSetup() {
  // Wait for API readiness (up to 30 s)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API_URL}/health`);
      if (r.ok) break;
    } catch {
      // not ready yet
    }
    await new Promise((res) => setTimeout(res, 500));
  }

  for (const u of USERS) {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u),
      });
      if (res.ok) {
        console.log(`[e2e-setup] registered ${u.email}`);
      } else if (res.status === 409) {
        console.log(`[e2e-setup] ${u.email} already exists — OK`);
      } else {
        const body = await res.text();
        console.warn(`[e2e-setup] register ${u.email} returned ${res.status}: ${body}`);
      }
    } catch (err) {
      console.warn(`[e2e-setup] failed to register ${u.email}:`, err);
    }
  }
}

export default globalSetup;
