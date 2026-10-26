import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach } from 'vitest';
import { _resetForTests, seedRbacData } from '../config/database.js';
import { seedEmailTemplates } from '../services/emailTemplateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
// Preserve explicit historical version-zero fixtures in older regression suites.
// New provisioning uses version one; the strict retirement suite removes this fixture hook.
const legacyFixtures = fs.readFileSync(path.resolve(__dirname,'fixtures/legacy-role-fixture.sql'),'utf8');

beforeEach(() => {
  _resetForTests(schemaSQL + legacyFixtures);
  seedRbacData();
  seedEmailTemplates();
});
