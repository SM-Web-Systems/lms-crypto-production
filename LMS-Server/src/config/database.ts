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

/** A1 — Redesign Phase A: widen users.role CHECK to include 'lecturer'.
 *  SQLite cannot ALTER a CHECK constraint, so the table must be recreated.
 *  Called FIRST so all subsequent ensures operate on the updated users table. */
function ensureLecturerRole(): void {
  const hasUsers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) return;

  const { sql } = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")
    .get() as { sql: string };
  if (sql.includes("'lecturer'")) return; // already migrated

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON'); // prevent SQLite ≥3.26.0 from auto-rewriting FKs in other tables
  db.exec(`
    BEGIN;
    ALTER TABLE users RENAME TO _users_old;
    CREATE TABLE users (
      id                        TEXT PRIMARY KEY,
      name                      TEXT NOT NULL,
      email                     TEXT UNIQUE NOT NULL,
      password_hash             TEXT NOT NULL,
      role                      TEXT NOT NULL DEFAULT 'student'
                                  CHECK (role IN ('student', 'lecturer', 'admin')),
      walletAddress             TEXT UNIQUE,
      created_at                TEXT DEFAULT (datetime('now')),
      updated_at                TEXT DEFAULT (datetime('now')),
      clerk_user_id             TEXT,
      description               TEXT,
      password_reset_expires_at TEXT,
      password_changed_at       TEXT,
      password_reset_token      TEXT,
      wallet_linking_status     TEXT DEFAULT 'none',
      auth_provider             TEXT DEFAULT 'local',
      ammawallet_user_id        TEXT
    );
    INSERT INTO users SELECT
      id, name, email, password_hash, role, walletAddress,
      created_at, updated_at, clerk_user_id, description,
      password_reset_expires_at, password_changed_at, password_reset_token,
      wallet_linking_status, auth_provider, ammawallet_user_id
    FROM _users_old;
    DROP TABLE _users_old;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id
      ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reset_token
      ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;
    COMMIT;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureLecturerRole();

/** A1-fix — repair stale "_users_old" FK references caused by ensureLecturerRole().
 *  SQLite ≥3.26.0 auto-rewrote FK text in 13 tables when "ALTER TABLE users RENAME TO _users_old"
 *  ran without PRAGMA legacy_alter_table=ON. With foreign_keys=ON, any DML (INSERT/UPDATE/DELETE)
 *  on those tables fails at prepare time with "no such table: main._users_old".
 *  This function detects stale tables and rebuilds them with the correct FK reference. */
function ensureUsersFKFix(): void {
  const stale = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%_users_old%'")
    .all() as { name: string }[];
  if (stale.length === 0) return;

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');

  for (const { name } of stale) {
    const tableRow = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name) as { sql: string } | undefined;
    if (!tableRow) continue;

    // Replace stale reference: REFERENCES "_users_old" → REFERENCES users
    const fixedSql = tableRow.sql.replace(/REFERENCES "_users_old"/g, 'REFERENCES users');

    // Column list for data copy
    const cols = (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[])
      .map((c) => c.name);
    const colList = cols.join(', ');

    // Explicit index definitions to recreate (auto-indexes have null sql, skip them)
    const indexes = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL")
      .all(name) as { sql: string }[];

    const tmpName = `_${name}_ufix`;

    db.exec(`
      BEGIN;
      ALTER TABLE "${name}" RENAME TO "${tmpName}";
      ${fixedSql};
      INSERT INTO "${name}" (${colList}) SELECT ${colList} FROM "${tmpName}";
      DROP TABLE "${tmpName}";
      ${indexes.map((i) => i.sql + ';').join('\n      ')}
      COMMIT;
    `);
  }

  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureUsersFKFix();

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

/** course_documents.course_ids — JSON array of course IDs for access restriction; NULL = open to all.
 *  Column was added to schema.sql but pre-existing tables created before that change lack it.
 *  Manual hotfix applied 2026-07-13; this ensure fn makes it automatic for all future deployments. */
function ensureCourseDocumentsCourseIdsColumn(): void {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='course_documents'").get();
  if (!has) return;
  const cols = db.prepare('PRAGMA table_info(course_documents)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'course_ids')) {
    db.exec('ALTER TABLE course_documents ADD COLUMN course_ids TEXT');
  }
}
ensureCourseDocumentsCourseIdsColumn();

/** SSO columns — auth_provider and ammawallet_user_id added for AmmaWallet SSO (Phase 1). */
function ensureSsoColumns(): void {
  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!hasUsers) return;
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'auth_provider')) {
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'");
  }
  if (!cols.some((c) => c.name === 'ammawallet_user_id')) {
    db.exec('ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
  }
}
ensureSsoColumns();

function ensureWalletLinkingStatusColumn(): void {
  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!hasUsers) return;
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'wallet_linking_status')) {
    db.exec("ALTER TABLE users ADD COLUMN wallet_linking_status TEXT DEFAULT 'none'");
    db.exec("UPDATE users SET wallet_linking_status = 'linked' WHERE walletAddress IS NOT NULL");
  }
}
ensureWalletLinkingStatusColumn();

function ensureNftCredentialsTable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nft_credentials'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE nft_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        wallet_address TEXT NOT NULL,
        mint_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (mint_status IN ('pending', 'minted', 'failed')),
        tx_hash TEXT,
        error TEXT,
        contract_id TEXT NOT NULL,
        network TEXT NOT NULL DEFAULT 'public',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE (user_id, quiz_id)
      );
      CREATE INDEX IF NOT EXISTS idx_nft_credentials_user ON nft_credentials(user_id);
      CREATE INDEX IF NOT EXISTS idx_nft_credentials_status ON nft_credentials(mint_status);
    `);
  }
}
ensureNftCredentialsTable();

/** A2 — course_lecturers: maps lecturers to their assigned courses. */
function ensureCourseLecturersTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_lecturers (
      course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (course_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_course_lecturers_user   ON course_lecturers(user_id);
    CREATE INDEX IF NOT EXISTS idx_course_lecturers_course ON course_lecturers(course_id);
  `);
}
ensureCourseLecturersTable();

/** A3 — lesson_completions: per-user per-item completion tracking. */
function ensureLessonCompletionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_completions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL,
      section_id   TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (user_id, course_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
      ON lesson_completions(user_id, course_id);
  `);
}
ensureLessonCompletionsTable();

/** A4 — course_completion_requirements: per-course NFT eligibility rules. */
function ensureCourseCompletionRequirementsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_completion_requirements (
      id                  TEXT PRIMARY KEY,
      course_id           TEXT NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
      require_all_lessons INTEGER NOT NULL DEFAULT 0,
      lesson_threshold    INTEGER NOT NULL DEFAULT 0,
      required_quiz_ids   TEXT NOT NULL DEFAULT '[]',
      min_quiz_score      INTEGER NOT NULL DEFAULT 70,
      require_submissions INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
ensureCourseCompletionRequirementsTable();

/** A5 — course_nft_applications: student applies for course NFT; admin approves then mints.
 *  Partial unique index prevents duplicate active applications (allows re-apply after rejection). */
function ensureCourseNftApplicationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_nft_applications (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id          TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      wallet_address     TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'minted')),
      applied_at         TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at        TEXT,
      reviewed_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
      review_notes       TEXT,
      lecturer_rec       TEXT CHECK (lecturer_rec IN ('approved', 'not_ready') OR lecturer_rec IS NULL),
      lecturer_rec_notes TEXT,
      lecturer_rec_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      lecturer_rec_at    TEXT,
      tx_hash            TEXT,
      credential_id      TEXT REFERENCES nft_credentials(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nft_apps_user_course ON course_nft_applications(user_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_nft_apps_status      ON course_nft_applications(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_apps_active
      ON course_nft_applications(user_id, course_id)
      WHERE status NOT IN ('rejected', 'minted');
  `);
}
ensureCourseNftApplicationsTable();

/** A6 — nft_credentials: add course_id and application_id for course-level mints.
 *  Existing quiz-triggered rows keep quiz_id; new course mints will populate course_id. */
function ensureNftCredentialsCourseId(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nft_credentials'")
    .get();
  if (!has) return;
  const cols = db.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'course_id')) {
    db.exec('ALTER TABLE nft_credentials ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE SET NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_nft_credentials_course ON nft_credentials(course_id)');
  }
  if (!cols.some((c) => c.name === 'application_id')) {
    db.exec('ALTER TABLE nft_credentials ADD COLUMN application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL');
  }
}
ensureNftCredentialsCourseId();

/** B0 — make nft_credentials.quiz_id nullable to support course-level mints.
 *  New course mints have no associated quiz; quiz_id will be NULL.
 *  Existing quiz-triggered rows keep their quiz_id unchanged.
 *  Must run AFTER ensureNftCredentialsCourseId() so course_id/application_id already exist. */
function ensureNftCredentialsQuizIdNullable(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nft_credentials'")
    .get();
  if (!has) return;
  const cols = db.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string; notnull: number }[];
  const quizIdCol = cols.find((c) => c.name === 'quiz_id');
  if (!quizIdCol || quizIdCol.notnull === 0) return; // already nullable

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON'); // prevent SQLite ≥3.26.0 from auto-rewriting FKs in other tables
  db.exec(`
    BEGIN;
    ALTER TABLE nft_credentials RENAME TO _nft_creds_b0_old;
    CREATE TABLE nft_credentials (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id        TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      mint_status    TEXT NOT NULL DEFAULT 'pending'
                       CHECK (mint_status IN ('pending', 'minted', 'failed')),
      tx_hash        TEXT,
      error          TEXT,
      contract_id    TEXT NOT NULL,
      network        TEXT NOT NULL DEFAULT 'public',
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now')),
      course_id      TEXT REFERENCES courses(id) ON DELETE SET NULL,
      application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      UNIQUE (user_id, quiz_id)
    );
    INSERT INTO nft_credentials
      (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, error,
       contract_id, network, created_at, updated_at, course_id, application_id)
    SELECT
      id, user_id, quiz_id, wallet_address, mint_status, tx_hash, error,
      contract_id, network, created_at, updated_at, course_id, application_id
    FROM _nft_creds_b0_old;
    DROP TABLE _nft_creds_b0_old;
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_user   ON nft_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_status ON nft_credentials(mint_status);
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_course ON nft_credentials(course_id);
    COMMIT;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureNftCredentialsQuizIdNullable();

/** B0-fix — repair stale FK reference in course_nft_applications.
 *  SQLite ≥ 3.26.0 auto-rewrites FK references when a table is renamed.
 *  ensureNftCredentialsQuizIdNullable() renamed nft_credentials → _nft_creds_b0_old
 *  without PRAGMA legacy_alter_table, so course_nft_applications.credential_id
 *  was silently rewritten to reference "_nft_creds_b0_old" (which was then dropped).
 *  This function detects that stale reference and rebuilds the table correctly. */
function ensureCourseNftApplicationsFKFix(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='course_nft_applications'")
    .get() as { sql: string } | undefined;
  if (!row) return;
  if (!row.sql.includes('_nft_creds_b0_old')) return; // already correct, nothing to do

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON'); // prevent FK auto-rewrite during rename
  db.exec(`
    BEGIN;
    ALTER TABLE course_nft_applications RENAME TO _nft_apps_fk_fix_old;
    CREATE TABLE course_nft_applications (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id          TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      wallet_address     TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'minted')),
      applied_at         TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at        TEXT,
      reviewed_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
      review_notes       TEXT,
      lecturer_rec       TEXT CHECK (lecturer_rec IN ('approved', 'not_ready') OR lecturer_rec IS NULL),
      lecturer_rec_notes TEXT,
      lecturer_rec_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      lecturer_rec_at    TEXT,
      tx_hash            TEXT,
      credential_id      TEXT REFERENCES nft_credentials(id) ON DELETE SET NULL
    );
    INSERT INTO course_nft_applications
      (id, user_id, course_id, wallet_address, status, applied_at,
       reviewed_at, reviewed_by, review_notes,
       lecturer_rec, lecturer_rec_notes, lecturer_rec_by, lecturer_rec_at,
       tx_hash, credential_id)
    SELECT
      id, user_id, course_id, wallet_address, status, applied_at,
      reviewed_at, reviewed_by, review_notes,
      lecturer_rec, lecturer_rec_notes, lecturer_rec_by, lecturer_rec_at,
      tx_hash, credential_id
    FROM _nft_apps_fk_fix_old;
    DROP TABLE _nft_apps_fk_fix_old;
    CREATE INDEX IF NOT EXISTS idx_nft_apps_user_course ON course_nft_applications(user_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_nft_apps_status      ON course_nft_applications(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_apps_active
      ON course_nft_applications(user_id, course_id)
      WHERE status NOT IN ('rejected', 'minted');
    COMMIT;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureCourseNftApplicationsFKFix();

/** L-007 — Add sponsor_label column to courses for cohort/sponsor tagging. */
function ensureCourseSponsorLabel(): void {
  try {
    db.exec('ALTER TABLE courses ADD COLUMN sponsor_label TEXT');
  } catch { /* column already exists */ }
}
ensureCourseSponsorLabel();

/** L-013 — Add is_superseded column to nft_credentials for re-mint correction flow.
 *  When an admin re-mints a credential, the old row is marked is_superseded=1 and a
 *  new row is inserted. Both remain in the DB for audit purposes. */
function ensureNftCredentialsIsSuperseded(): void {
  try {
    db.exec('ALTER TABLE nft_credentials ADD COLUMN is_superseded INTEGER NOT NULL DEFAULT 0');
  } catch { /* column already exists */ }
}
ensureNftCredentialsIsSuperseded();

/** NM-A2 — Add soroban_token_id column to nft_credentials.
 *  Stores the on-chain Soroban u32 token ID returned by mint() so Nfts.tsx can match
 *  credentials to NFTs deterministically by token ID instead of position.
 *  Nullable: legacy credentials minted before this change have NULL. */
function ensureNftCredentialsSorobanTokenId(): void {
  try {
    db.exec('ALTER TABLE nft_credentials ADD COLUMN soroban_token_id INTEGER');
  } catch { /* column already exists */ }
}
ensureNftCredentialsSorobanTokenId();

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
