// One-time migration: encrypt existing plaintext TOTP secrets
// Usage: TOTP_ENCRYPTION_KEY=<hex> DATABASE_URL=<url> npx tsx scripts/migrate-totp-secrets.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isNotNull, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { encryptTotpSecret } from "../src/lib/totp-crypto";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function migrate() {
  const users = await db
    .select({ id: schema.users.id, twoFaSecret: schema.users.twoFaSecret })
    .from(schema.users)
    .where(isNotNull(schema.users.twoFaSecret));

  console.log(`Found ${users.length} users with TOTP secrets`);
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    // Skip if already encrypted (base64 with IV prefix, not base32 TOTP format)
    // Base32 TOTP secrets contain only A-Z2-7, encrypted values are base64 with +/= chars
    const isBase32 = /^[A-Z2-7]+=*$/.test(user.twoFaSecret!);
    if (!isBase32) {
      skipped++;
      continue;
    }

    const encrypted = encryptTotpSecret(user.twoFaSecret!);
    await db.update(schema.users).set({ twoFaSecret: encrypted })
      .where(eq(schema.users.id, user.id));
    migrated++;
  }

  console.log(`Migrated: ${migrated}, Skipped (already encrypted): ${skipped}`);
  await sql.end();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
