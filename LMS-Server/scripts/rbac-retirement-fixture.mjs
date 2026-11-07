// Synthetic current-v1 schema for testing the v2 migration. Never consumes an external DB.
import { readFileSync } from 'node:fs';

const canonical = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
const password = '  password_hash TEXT NOT NULL,';
const marker = "VALUES('rbac-only-v2','new-database');";
if (!canonical.includes(password) || !canonical.includes(marker)) {
  throw new Error('Synthetic v1 fixture anchors changed');
}

export const syntheticV1Schema = canonical
  .replace(password, password + "\n  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'lecturer', 'admin')),")
  .replace(marker, "VALUES('rbac-only-v1','new-database');")
  + '\nCREATE TRIGGER trg_auto_assign_user_role AFTER INSERT ON users FOR EACH ROW BEGIN SELECT 1; END;';
