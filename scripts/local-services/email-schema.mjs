// Pure DDL generation for the missing table, applied only by the owned local initializer.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { settings } from './stack.mjs';
const c = settings();
const backend = path.join(c.wallet, 'packages/backend');
const require = createRequire(path.join(backend, 'package.json'));
const { generateDrizzleJson, generateMigration } = require('drizzle-kit/api');
const schema = await import(pathToFileURL(path.join(backend, 'src/db/schema/index.ts')));
if (!schema.emailVerificationTokens)
    throw Error('Wallet checkout needs the email-verification schema fix');
const { emailVerificationTokens, ...before } = schema;
const previous = generateDrizzleJson(before);
process.stdout.write(JSON.stringify(await generateMigration(previous, generateDrizzleJson(schema, previous.id))));
