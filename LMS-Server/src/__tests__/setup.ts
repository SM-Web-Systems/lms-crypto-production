import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach } from 'vitest';
import { _resetForTests } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

beforeEach(() => {
  _resetForTests(schemaSQL);
});
