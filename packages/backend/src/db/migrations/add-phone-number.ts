import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export async function addPhoneNumber(db: PostgresJsDatabase) {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
  `);

  // Make email nullable (phone can be the primary identifier)
  await db.execute(sql`
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  `);

  // Ensure at least one identifier exists
  await db.execute(sql`
    ALTER TABLE users
    ADD CONSTRAINT users_email_or_phone_check
    CHECK (email IS NOT NULL OR phone_number IS NOT NULL);
  `);
}
