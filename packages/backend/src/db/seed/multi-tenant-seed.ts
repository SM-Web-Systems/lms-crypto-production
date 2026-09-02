/**
 * Phase 0 multi-tenant seed script
 * Source of truth: /home/webadmin/projects/AmmaWallet/DECISIONS/phase0-checklist-v3.md
 *
 * Run via:
 *   docker exec -e PLATFORM_WALLET=... -e SIGNING_PUBLIC_KEY=... \
 *     -e LMS_KEY_PREFIX=... -e LMS_KEY_HASH=... \
 *     amma-api sh -c "cd /app && npx tsx src/db/seed/multi-tenant-seed.ts"
 *
 * Idempotent: uses ON CONFLICT DO NOTHING / DO UPDATE for safe re-runs.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) throw new Error("DATABASE_URL not set");

const PLATFORM_WALLET = process.env.PLATFORM_WALLET;
const SIGNING_PUBLIC_KEY = process.env.SIGNING_PUBLIC_KEY;
const LMS_KEY_PREFIX = process.env.LMS_KEY_PREFIX;
const LMS_KEY_HASH = process.env.LMS_KEY_HASH;

if (!PLATFORM_WALLET) throw new Error("PLATFORM_WALLET env var required");
if (!SIGNING_PUBLIC_KEY) throw new Error("SIGNING_PUBLIC_KEY env var required");
if (!LMS_KEY_PREFIX) throw new Error("LMS_KEY_PREFIX env var required");
if (!LMS_KEY_HASH) throw new Error("LMS_KEY_HASH env var required");

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function seed() {
  console.log("=== Phase 0 Multi-Tenant Seed ===");

  // ─── 1. Tenants ──────────────────────────────────────────────────────────────
  console.log("\n[1/6] Seeding tenants...");
  const tenantRows = await db.execute(sql`
    INSERT INTO tenants (slug, name, contact_email, is_active)
    VALUES
      ('ammawallet-internal', 'AmmaWallet Internal', 'ops@ammawallet.com', true),
      ('lms-smwebsystems',    'SM Web Systems LMS',  'admin@smwebsystems.com', true)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug
  `);
  console.log(`  Inserted ${tenantRows.length} tenant(s) (0 if already existed)`);

  // Fetch both tenant IDs regardless of whether we inserted or not
  const tenants = await db.execute(sql`
    SELECT id, slug FROM tenants
    WHERE slug IN ('ammawallet-internal', 'lms-smwebsystems')
    ORDER BY slug
  `);
  const tenantMap: Record<string, number> = {};
  for (const t of tenants) {
    tenantMap[t.slug as string] = t.id as number;
  }
  console.log("  Tenant IDs:", tenantMap);

  const internalTenantId = tenantMap["ammawallet-internal"];
  const lmsTenantId = tenantMap["lms-smwebsystems"];
  if (!internalTenantId || !lmsTenantId) {
    throw new Error("Failed to find both tenant rows after insert");
  }

  // ─── 2. Billing policies (1 per tenant, all locked defaults) ─────────────────
  console.log("\n[2/6] Seeding billing policies...");
  const policyRows = await db.execute(sql`
    INSERT INTO tenant_billing_policy (
      tenant_id, version, is_current,
      wallet_funding_enabled, wallet_funding_xlm, new_wallet_platform_fee_xlm, wallet_funding_mode,
      onboarding_enabled, onboarding_fee_xlm,
      monthly_maintenance_enabled, monthly_fee_per_active_user, activity_window_days, grace_period_days,
      acquisition_mode_enabled, acquisition_debt_limit_xlm,
      created_by
    )
    VALUES
      (${internalTenantId}, 1, true,
       true, 1.0000, 2.0000, 'auto',
       true, 1.0000,
       true, 0.1000, 90, 14,
       true, -300.0000000,
       'seed'),
      (${lmsTenantId}, 1, true,
       true, 1.0000, 2.0000, 'auto',
       true, 1.0000,
       true, 0.1000, 90, 14,
       true, -300.0000000,
       'seed')
    ON CONFLICT (tenant_id, version) DO NOTHING
    RETURNING id, tenant_id
  `);
  console.log(`  Inserted ${policyRows.length} billing policy(ies)`);

  // ─── 3. Wallet roles (4 system rows) ─────────────────────────────────────────
  console.log("\n[3/6] Seeding wallet roles...");
  const roleRows = await db.execute(sql`
    INSERT INTO wallet_roles (role_slug, display_name, description, public_key, network, is_system, tenant_id)
    VALUES
      ('platform-ops',   'Platform Operations', 'Main platform funding wallet for Stellar operations', ${PLATFORM_WALLET},   'public', true, NULL),
      ('fee-collection', 'Fee Collection',       'Receives 2 XLM platform fee on each new wallet activation',               NULL, 'public', true, NULL),
      ('nft-minting',    'NFT Minting',          'Keypair reserved for NFT minting operations (Phase 6)',                    NULL, 'public', true, NULL),
      ('amma-signing',   'AmmaWallet Signing',   'Stellar transaction signing keypair',                     ${SIGNING_PUBLIC_KEY}, 'public', true, NULL)
    ON CONFLICT (role_slug) DO UPDATE
      SET public_key   = EXCLUDED.public_key,
          display_name = EXCLUDED.display_name,
          updated_at   = NOW()
    RETURNING id, role_slug
  `);
  console.log(`  Upserted ${roleRows.length} wallet role(s)`);
  for (const r of roleRows) console.log(`    ${r.role_slug} (id=${r.id})`);

  // ─── 4. Tenant API key (LMS production) ──────────────────────────────────────
  console.log("\n[4/6] Seeding tenant API key (LMS)...");
  const keyRows = await db.execute(sql`
    INSERT INTO tenant_api_keys (tenant_id, name, key_hash, key_prefix, scopes, rate_limit_per_minute, is_active)
    VALUES (
      ${lmsTenantId},
      'LMS Production (migrated from API_KEYS env)',
      ${LMS_KEY_HASH},
      ${LMS_KEY_PREFIX},
      ARRAY['wallet:create','sso:verify','funding:read','dashboard:read'],
      60,
      true
    )
    ON CONFLICT (key_hash) DO NOTHING
    RETURNING id
  `);
  console.log(`  Inserted ${keyRows.length} API key(s)`);

  // ─── 5. Bundle catalog ────────────────────────────────────────────────────────
  console.log("\n[5/6] Seeding bundle catalog...");
  const bundleRows = await db.execute(sql`
    INSERT INTO bundle_catalog (slug, name, approx_users, price_xlm, is_active, sort_order)
    VALUES
      ('starter-100', 'Starter 100',  100,  300.0,  true, 1),
      ('starter-200', 'Starter 200',  200,  600.0,  true, 2),
      ('growth-500',  'Growth 500',   500,  1500.0, true, 3),
      ('scale-1000',  'Scale 1000',  1000,  3000.0, true, 4),
      ('custom',      'Custom',       NULL, NULL,   true, 5)
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug
  `);
  console.log(`  Inserted ${bundleRows.length} bundle(s)`);

  // ─── 6. System config ─────────────────────────────────────────────────────────
  console.log("\n[6/6] Seeding system config...");
  const configRows = await db.execute(sql`
    INSERT INTO system_config (key, value, description, updated_by)
    VALUES
      ('platform_ops_daily_tx_limit',     '10000', 'Max Stellar txs from platform-ops per day',                        'seed'),
      ('queue_processor_batch_size',      '50',    'Max items processed per provisioning queue run',                   'seed'),
      ('unallocated_deposit_notify',      'true',  'Email all platform_admins on unallocated deposit receipt',         'seed'),
      ('deficit_email_cooldown_mins',     '60',    'Min minutes between deficit-deepening emails per tenant',          'seed'),
      ('maintenance_grace_reminder_days', '3',     'Days before grace period expiry to send reminder notification',    'seed')
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  `);
  console.log(`  Inserted ${configRows.length} config row(s)`);

  console.log("\n=== Seed complete ===");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
