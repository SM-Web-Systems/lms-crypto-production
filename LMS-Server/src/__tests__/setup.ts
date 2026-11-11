import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { afterAll, beforeEach } from 'vitest';
import { _resetForTests, seedRbacData } from '../config/database.js';
import { seedEmailTemplates } from '../services/emailTemplateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
// Historical version-zero users are explicit test fixtures, not runtime grants.
const legacyFixtures = fs.readFileSync(path.resolve(__dirname, 'fixtures/legacy-role-fixture.sql'), 'utf8');
// The in-memory unit DB has no on-disk data volume. Supply an actual isolated
// directory for its absent hold marker instead of relying on a missing ./data.
const writerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-unit-writer-'));
const defaultHoldFile = path.join(writerDirectory, '.writer-hold');

beforeEach(() => {
  process.env.WRITER_HOLD_FILE = defaultHoldFile;
  _resetForTests(schemaSQL + legacyFixtures);
  seedRbacData();
  seedEmailTemplates();
});

afterAll(() => {
  if (process.env.WRITER_HOLD_FILE === defaultHoldFile) delete process.env.WRITER_HOLD_FILE;
  fs.rmSync(writerDirectory, { recursive: true, force: true });
});
