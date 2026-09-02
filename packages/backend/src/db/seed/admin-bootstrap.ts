/**
 * admin-bootstrap.ts — One-time super_admin seed script.
 *
 * Creates the first internal super_admin row in the internal_admins table.
 * Idempotent: exits cleanly if a super_admin already exists.
 *
 * Run once, manually, by webadmin:
 *   npx tsx src/db/seed/admin-bootstrap.ts
 *
 * Required environment variables (set temporarily, remove after bootstrap):
 *   INITIAL_ADMIN_EMAIL    — email address for the first super_admin
 *   INITIAL_ADMIN_NAME     — display name
 *   INITIAL_ADMIN_PASSWORD — strong plaintext password (hashed before DB write)
 *   DATABASE_URL           — already set in app.env / .env
 *
 * IMPORTANT: Remove INITIAL_ADMIN_* from app.env after a successful run.
 * These values are not used at runtime — they exist only for this script.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../index";

const SALT_ROUNDS = 12;

async function bootstrap(): Promise<void> {
  const email    = process.env.INITIAL_ADMIN_EMAIL;
  const name     = process.env.INITIAL_ADMIN_NAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !name || !password) {
    console.error(
      "FATAL: INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, and INITIAL_ADMIN_PASSWORD " +
      "must all be set in the environment.",
    );
    process.exit(1);
  }

  // Idempotency check — skip if any super_admin already exists
  const existing = await db
    .select({ id: schema.internalAdmins.id })
    .from(schema.internalAdmins)
    .where(eq(schema.internalAdmins.role, "super_admin"))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `[admin-bootstrap] super_admin already exists (id=${existing[0].id}) — skipping.`,
    );
    console.log("[admin-bootstrap] To create additional admins, use the admin API.");
    process.exit(0);
  }

  // Hash password before storing — never log or return the plaintext
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [inserted] = await db
    .insert(schema.internalAdmins)
    .values({
      email,
      name,
      role: "super_admin",
      passwordHash,
      isActive: true,
      createdBy: null, // self-bootstrapped; FK allows null
    })
    .returning({ id: schema.internalAdmins.id, email: schema.internalAdmins.email });

  console.log(
    `[admin-bootstrap] super_admin created: id=${inserted.id} email=${inserted.email}`,
  );
  console.log(
    "[admin-bootstrap] *** IMPORTANT: Remove INITIAL_ADMIN_* from app.env now. ***",
  );
}

bootstrap().catch((err) => {
  console.error("[admin-bootstrap] FATAL:", err);
  process.exit(1);
});
