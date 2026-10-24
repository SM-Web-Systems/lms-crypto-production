/**
 * Playwright global setup — seeds E2E test users via the registration API.
 * Runs once before all test files.  Idempotent: 409 (duplicate) is ignored.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
  { name: 'E2E Sponsor A', email: 'sponsor-a@test.com', password: 'password123' },
  { name: 'E2E Sponsor B', email: 'sponsor-b@test.com', password: 'password123' },
  { name: 'E2E Sponsor Student', email: 'sponsor-student@test.com', password: 'password123' },
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
  // In CI, DATABASE_PATH is set explicitly. For local runs, fall back to the
  // same temp path used by the webServer block in playwright.config.ts.
  const dbPath = process.env.DATABASE_PATH || '';
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

    // Assign sponsor role to sponsor-a@test.com and sponsor-b@test.com.
    // Sponsor role is not assignable via the public API, so we use sqlite3.
    for (const email of ['sponsor-a@test.com', 'sponsor-b@test.com']) {
      try {
        execSync(
          `sqlite3 "${dbPath}" "INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) SELECT u.id, 'role_sponsor', u.id FROM users u WHERE u.email = '${email}';"`,
          { stdio: 'pipe' },
        );
        console.log(`[e2e-setup] assigned sponsor role to ${email}`);
      } catch (err) {
        console.warn(`[e2e-setup] sponsor role assignment failed for ${email}:`, err);
      }
    }

    // Seed sponsor E2E test data: course, cohorts, memberships, payment.
    // Uses a temp SQL file to avoid shell-escaping issues.
    // All statements are idempotent (INSERT OR IGNORE).
    try {
      const seedSQL = [
        "INSERT OR IGNORE INTO courses (id, title, course_code, sections) VALUES ('e2e-sponsor-course-01', 'E2E Sponsor Test Course', 'E2E-SPNS-01', '[]');",
        "INSERT OR IGNORE INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled) VALUES ('e2e-sponsor-pricing-01', 'e2e-sponsor-course-01', 5000, 'USD', 1, 'both');",
        "INSERT OR IGNORE INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at) SELECT 'e2e-cohort-a', 'E2E Cohort Alpha', u.id, 'e2e-sponsor-course-01', 'paid', 'active', datetime('now') FROM users u WHERE u.email = 'sponsor-a@test.com';",
        "INSERT OR IGNORE INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at) SELECT 'e2e-cohort-b', 'E2E Cohort Beta', u.id, 'e2e-sponsor-course-01', 'paid', 'active', datetime('now') FROM users u WHERE u.email = 'sponsor-b@test.com';",
        "INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) SELECT 'e2e-cohort-a', u.id, datetime('now') FROM users u WHERE u.email = 'sponsor-student@test.com';",
        "INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) SELECT 'e2e-cohort-b', u.id, datetime('now') FROM users u WHERE u.email = 'student@test.com';",
        "INSERT OR IGNORE INTO user_course_codes (user_id, course_code) SELECT u.id, 'E2E-SPNS-01' FROM users u WHERE u.email = 'sponsor-student@test.com';",
        "INSERT OR IGNORE INTO user_course_codes (user_id, course_code) SELECT u.id, 'E2E-SPNS-01' FROM users u WHERE u.email = 'student@test.com';",
        "INSERT OR IGNORE INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, created_at, updated_at) SELECT 'e2e-payment-cohort-a', u.id, 'e2e-sponsor-course-01', 5000, 'USD', 'manual', 'confirmed', datetime('now'), datetime('now') FROM users u WHERE u.email = 'sponsor-student@test.com';",
        "INSERT OR IGNORE INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, created_at, updated_at) SELECT 'e2e-payment-cohort-b', u.id, 'e2e-sponsor-course-01', 5000, 'USD', 'manual', 'confirmed', datetime('now'), datetime('now') FROM users u WHERE u.email = 'student@test.com';",
        "INSERT OR IGNORE INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at) SELECT 'e2e-nft-app-a', u.id, 'e2e-sponsor-course-01', '0xE2E_FAKE', 'minted', datetime('now') FROM users u WHERE u.email = 'sponsor-student@test.com';",
        "INSERT OR IGNORE INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash) SELECT 'e2e-badge-cohort-a', u.id, 'e2e-sponsor-course-01', 'e2e-nft-app-a', '<svg>e2e</svg>', 'e2e-hash-a' FROM users u WHERE u.email = 'sponsor-student@test.com';",
        "INSERT OR IGNORE INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at) SELECT 'e2e-nft-app-b', u.id, 'e2e-sponsor-course-01', '0xE2E_FAKE_B', 'minted', datetime('now') FROM users u WHERE u.email = 'student@test.com';",
        "INSERT OR IGNORE INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash) SELECT 'e2e-badge-cohort-b', u.id, 'e2e-sponsor-course-01', 'e2e-nft-app-b', '<svg>e2e</svg>', 'e2e-hash-b' FROM users u WHERE u.email = 'student@test.com';",
      ].join('\n');
      const tmpFile = join(tmpdir(), `lms-e2e-seed-${Date.now()}.sql`);
      writeFileSync(tmpFile, seedSQL);
      execSync(`sqlite3 "${dbPath}" < "${tmpFile}"`, { stdio: 'pipe' });
      unlinkSync(tmpFile);
      console.log('[e2e-setup] seeded sponsor E2E test data (course, cohorts, payments, badges)');
    } catch (err) {
      console.warn('[e2e-setup] sponsor E2E data seeding failed (sqlite3):', err);
    }
  } else {
    console.warn('[e2e-setup] DATABASE_PATH not set — skipping RBAC promotions and sponsor seeding');
  }
}

export default globalSetup;
