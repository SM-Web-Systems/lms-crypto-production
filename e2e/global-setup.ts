/**
 * Playwright global setup — seeds E2E test users via the registration API.
 * Runs once before all test files.  Idempotent: 409 (duplicate) is ignored.
 */

import { execSync } from 'child_process';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

interface TestUser {
  name: string;
  email: string;
  password: string;
}

const USERS: TestUser[] = [
  { name: 'E2E Admin', email: 'admin@test.com', password: 'password123' },
  { name: 'E2E Student', email: 'student@test.com', password: 'password123' },
  { name: 'E2E Super Admin', email: 'superadmin@test.com', password: 'password123' },
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

  // Promote superadmin@test.com to super-admin RBAC role.
  // The API blocks super-admin assignment (ESC-4), so we assign directly via
  // sqlite3. ADMIN_EMAILS auto-promotes to the legacy admin column; this adds
  // the RBAC role that carries privacy.view_deleted_identity.
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath) {
    try {
      execSync(
        `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) SELECT u.id, r.id, u.id FROM users u, roles r WHERE u.email = 'superadmin@test.com' AND r.name = 'super-admin';"`,
        { stdio: 'pipe' },
      );
      console.log('[e2e-setup] promoted superadmin@test.com to super-admin RBAC role');
    } catch (err) {
      console.warn('[e2e-setup] super-admin RBAC promotion failed (sqlite3):', err);
    }
  } else {
    console.warn('[e2e-setup] DATABASE_PATH not set — skipping super-admin RBAC promotion');
  }
}

export default globalSetup;
