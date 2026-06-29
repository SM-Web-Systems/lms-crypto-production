import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = process.env.DATABASE_PATH || './data/student_ms.db';

// Ensure directory exists
import fs from 'fs';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export let db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure user_course_codes exists (for DBs created before course-code access was added)
function ensureCourseCodeTables(): void {
  const hasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_course_codes'")
    .get();
  if (!hasTable) {
    db.exec(`
      CREATE TABLE user_course_codes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_code TEXT NOT NULL,
        PRIMARY KEY (user_id, course_code)
      );
      CREATE INDEX IF NOT EXISTS idx_user_course_codes_user ON user_course_codes(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_course_codes_code ON user_course_codes(course_code);
    `);
  }
}
ensureCourseCodeTables();

function ensureClerkUserIdColumn(): void {
  const hasUsers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) return;

  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'clerk_user_id')) {
    db.exec('ALTER TABLE users ADD COLUMN clerk_user_id TEXT');
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL'
  );
}
ensureClerkUserIdColumn();

/** Profile API selects users.description — ensure column exists on older databases. */
function ensureUsersDescriptionColumn(): void {
  const hasUsers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) return;
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'description')) {
    db.exec('ALTER TABLE users ADD COLUMN description TEXT');
  }
}
ensureUsersDescriptionColumn();

function ensureAnnouncementsTable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE announcements (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL,
        scope      TEXT NOT NULL DEFAULT 'general' CHECK (scope IN ('general', 'course')),
        course_id  TEXT REFERENCES courses(id) ON DELETE CASCADE,
        author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pinned     INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_announcements_scope    ON announcements(scope);
      CREATE INDEX IF NOT EXISTS idx_announcements_course   ON announcements(course_id);
      CREATE INDEX IF NOT EXISTS idx_announcements_created  ON announcements(created_at DESC);
    `);
  }
}
ensureAnnouncementsTable();

function ensureUserProfilesTable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE user_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        avatar_path  TEXT,
        whatsapp     TEXT,
        telegram     TEXT,
        linkedin_url TEXT,
        github_url   TEXT,
        twitter_url  TEXT,
        website_url  TEXT,
        custom_links TEXT DEFAULT '[]',
        updated_at   TEXT DEFAULT (datetime('now'))
      )
    `);
  } else {
    const cols = db.prepare('PRAGMA table_info(user_profiles)').all() as { name: string }[];
    const addCol = (col: string, def: string) => {
      if (!cols.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE user_profiles ADD COLUMN ${col} ${def}`);
      }
    };
    addCol('avatar_path', 'TEXT');
    addCol('whatsapp', 'TEXT');
    addCol('telegram', 'TEXT');
    addCol('linkedin_url', 'TEXT');
    addCol('github_url', 'TEXT');
    addCol('twitter_url', 'TEXT');
    addCol('website_url', 'TEXT');
    addCol('custom_links', "TEXT DEFAULT '[]'");
  }
}
ensureUserProfilesTable();

function ensureCourseInvitesTable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='course_invites'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE course_invites (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_course_invites_course ON course_invites(course_id);
      CREATE INDEX IF NOT EXISTS idx_course_invites_email ON course_invites(email);
      CREATE INDEX IF NOT EXISTS idx_course_invites_token ON course_invites(token);
    `);
  }
}
ensureCourseInvitesTable();

function ensureConversationReadsTable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_reads'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE conversation_reads (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, conversation_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conv_reads_user ON conversation_reads(user_id);
    `);
  }
}
ensureConversationReadsTable();

function ensureForumTopicCourseIdColumn(): void {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forum_topics'").get();
  if (!has) return;
  const cols = db.prepare('PRAGMA table_info(forum_topics)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'course_id')) {
    db.exec('ALTER TABLE forum_topics ADD COLUMN course_id TEXT NULL REFERENCES courses(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_forum_topics_course_id ON forum_topics(course_id)');
  }
}
ensureForumTopicCourseIdColumn();

function ensureQuizInformationColumn(): void {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quizzes'").get();
  if (!has) return;
  const cols = db.prepare('PRAGMA table_info(quizzes)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'information')) {
    db.exec('ALTER TABLE quizzes ADD COLUMN information TEXT');
  }
}
ensureQuizInformationColumn();

export function query<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  const stmt = db.prepare(sql);
  return (stmt.get(...params) as T) || null;
}

export function execute(sql: string, params: unknown[] = []): number {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return result.changes;
}

export function insert(sql: string, params: unknown[] = []): string | number {
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return Number(result.lastInsertRowid);
}

export function close(): void {
  db.close();
}

export function _resetForTests(schemaSQL: string): void {
  try { db.close(); } catch { /* already closed */ }
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSQL);
}
