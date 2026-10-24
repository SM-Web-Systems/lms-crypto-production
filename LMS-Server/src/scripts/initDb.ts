import dotenv from 'dotenv';
import { requestNewDatabaseInitialization } from '../config/databaseBootstrap.js';

dotenv.config();
if (process.argv.length !== 3 || process.argv[2] !== '--initialize-new') {
  console.error('Usage: node dist/scripts/initDb.js --initialize-new. DATABASE_PATH must name a new, isolated database.');
  process.exitCode = 1;
} else {
  try {
    requestNewDatabaseInitialization();
    const { close } = await import('../config/database.js');
    close();
    console.log('New application database initialized. No login accounts were created.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database initialization failed');
    process.exitCode = 1;
  }
}
