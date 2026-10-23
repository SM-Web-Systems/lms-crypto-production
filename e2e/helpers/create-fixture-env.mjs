import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
if (!process.env.GITHUB_ENV) throw new Error('CI environment output path required');
const key = `auth13-fixture-${randomBytes(32).toString('hex')}`;
appendFileSync(process.env.GITHUB_ENV,`E2E_SYNTHETIC_HMAC_KEY=${key}\nPAYSTACK_SECRET_KEY=${key}\n`);
