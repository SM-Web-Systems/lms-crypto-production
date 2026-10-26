/**
 * Set a user's role to admin by email (SQLite).
 * Use after the user exists in `users` (e.g. first Clerk sign-in).
 *
 * Usage: npm run db:promote-admin -- user@example.com
 */

import dotenv from 'dotenv';
dotenv.config();

import { queryOne, close } from '../config/database.js';

import { provisionAdministratorFromConsole } from '../services/roleSecurityService.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: npm run db:promote-admin -- <email>');
  process.exit(1);
}

const row = queryOne<{ id: string; name: string }>(
  'SELECT id, name FROM users WHERE email = ?',
  [email]
);
if (!row) {
  console.error(`No user with email "${email}". Sign in once with Clerk so a row is created, then run this again.`);
  process.exit(1);
}

try {
  const changed = provisionAdministratorFromConsole(row.id);
  console.log(`${changed ? 'Granted administrator access' : 'Administrator access already assigned'}: ${row.id}`);
} finally { close(); }
