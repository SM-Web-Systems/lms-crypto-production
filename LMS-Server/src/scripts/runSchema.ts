/**
 * Run the LMS schema once against the server DB.
 * Uses the same DB path as src/config/database.ts (default: ./data/student_ms.db).
 *
 * Usage:
 *   npm run db:schema
 *   # Or with custom schema path:
 *   SCHEMA_SQL_PATH=/path/to/schema.sql npm run db:schema
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { db, close } from '../config/database.js';

// Prefer schema in this repo; override with SCHEMA_SQL_PATH if using external repo
const DEFAULT_SCHEMA_PATH = path.join(process.cwd(), 'database/schema.sql');
const SCHEMA_PATH = process.env.SCHEMA_SQL_PATH || DEFAULT_SCHEMA_PATH;

function runSchema() {
  try {
    if (!fs.existsSync(SCHEMA_PATH)) {
      console.error(`Schema file not found: ${SCHEMA_PATH}`);
      console.error('Set SCHEMA_SQL_PATH or place the schema at the path above.');
      process.exit(1);
    }
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    console.log('Running schema from', SCHEMA_PATH);
    db.exec(schema);
    console.log('Schema applied successfully.');
  } catch (err) {
    console.error('Error running schema:', err);
    process.exit(1);
  } finally {
    close();
  }
}

runSchema();
