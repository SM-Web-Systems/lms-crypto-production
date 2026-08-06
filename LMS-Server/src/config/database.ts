import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// In test environments (vitest sets VITEST=true), use in-memory SQLite so that
// _resetForTests can mutate the shared `db` object in-place without relying on
// ESM live-binding propagation across test-file imports.
const DB_PATH = process.env.DATABASE_PATH ||
  (process.env.VITEST ? ':memory:' : './data/student_ms.db');

// Ensure directory exists (skip for in-memory databases)
import fs from 'fs';
if (DB_PATH !== ':memory:') {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
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
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL'
    );
  }
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

/** P7-C1 — migrate lesson_completions: make completed_at nullable, add progress columns. */
function ensureLessonCompletionsProgressColumns(): void {
  const cols = db.prepare('PRAGMA table_info(lesson_completions)').all() as { name: string; notnull: number }[];
  const hasProgressPct = cols.some((c) => c.name === 'progress_pct');
  if (hasProgressPct) return; // already migrated

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    BEGIN;
    ALTER TABLE lesson_completions RENAME TO _lesson_completions_p7_old;
    CREATE TABLE lesson_completions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      item_id      TEXT NOT NULL,
      section_id   TEXT NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      marked_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      progress_pct    INTEGER,
      last_position_s INTEGER,
      UNIQUE (user_id, course_id, item_id)
    );
    INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, completed_at, marked_by)
      SELECT id, user_id, course_id, item_id, section_id, completed_at, marked_by
      FROM _lesson_completions_p7_old;
    DROP TABLE _lesson_completions_p7_old;
    CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course
      ON lesson_completions(user_id, course_id);
    COMMIT;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureLessonCompletionsProgressColumns();

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

/** LMS-ADM-001 — audit_log table for admin mutation tracking. */
function ensureAuditLogTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  `);
}
ensureAuditLogTable();

/** LMS-DB-001 — Add FK quizzes.course_id → courses(id) ON DELETE SET NULL.
 *  Existing databases created before this change have no FK on course_id.
 *  This function detects the missing FK and rebuilds the table.
 *  NOTE: Production DB migration is a SEPARATE deployment task — this only
 *  affects in-memory test DBs and any NEW databases created from schema.sql. */
function ensureQuizzesCourseIdFK(): void {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quizzes'")
    .get();
  if (!has) return;

  const { sql } = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='quizzes'")
    .get() as { sql: string };
  if (sql.includes('REFERENCES')) return; // already has FK

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    BEGIN;
    ALTER TABLE quizzes RENAME TO _quizzes_db001_old;
    CREATE TABLE quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      information TEXT,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      passing_score INTEGER NOT NULL DEFAULT 70,
      questions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO quizzes (id, title, description, information, course_id, passing_score, questions, created_at, updated_at)
      SELECT id, title, description, information, course_id, passing_score, questions, created_at, updated_at
      FROM _quizzes_db001_old;
    DROP TABLE _quizzes_db001_old;
    CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
    COMMIT;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
ensureQuizzesCourseIdFK();

/** Phase 1 Course-Centric IA: add course_id, week_id, item_id to submissions. */
function ensureSubmissionsCourseContext(): void {
  const has = db.prepare(
    "SELECT 1 FROM pragma_table_info('submissions') WHERE name='course_id'"
  ).get();
  if (!has) {
    db.exec("ALTER TABLE submissions ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE SET NULL");
    db.exec("ALTER TABLE submissions ADD COLUMN week_id TEXT");
    db.exec("ALTER TABLE submissions ADD COLUMN item_id TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_submissions_course ON submissions(course_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_submissions_course_week ON submissions(course_id, week_id)");
  }
}
ensureSubmissionsCourseContext();

/** Phase 1 Course-Centric IA: add week_id to course_documents for per-week placement. */
function ensureCourseDocumentsWeekId(): void {
  const has = db.prepare(
    "SELECT 1 FROM pragma_table_info('course_documents') WHERE name='week_id'"
  ).get();
  if (!has) {
    db.exec("ALTER TABLE course_documents ADD COLUMN week_id TEXT");
  }
}
ensureCourseDocumentsWeekId();

/** Phase 7 C2 — notifications table for in-app student notifications. */
function ensureNotificationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      link       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read
      ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at);
  `);
}
ensureNotificationsTable();

/** Phase 11 C1a — course_pricing + payments tables for certificate monetization. */
function ensurePaymentsTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_pricing (
      id          TEXT PRIMARY KEY,
      course_id   TEXT NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency    TEXT NOT NULL DEFAULT 'USD',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_course_pricing_course_id
      ON course_pricing(course_id);

    CREATE TABLE IF NOT EXISTS payments (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      amount_cents    INTEGER NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'USD',
      payment_method  TEXT NOT NULL DEFAULT 'manual',
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'waived')),
      confirmed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at    TEXT,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);
    CREATE INDEX IF NOT EXISTS idx_payments_application_id ON payments(application_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);

  // Add payment_id FK to course_nft_applications if not present
  const cols = db.prepare("PRAGMA table_info('course_nft_applications')").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'payment_id')) {
    try {
      db.exec('ALTER TABLE course_nft_applications ADD COLUMN payment_id TEXT REFERENCES payments(id)');
    } catch {
      // Column already exists — safe to ignore
    }
  }
}
ensurePaymentsTables();

/** Phase 11 C2 — certificate_badges table + tier columns. */
function ensureBadgesTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS certificate_badges (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id      TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      application_id TEXT NOT NULL REFERENCES course_nft_applications(id) ON DELETE CASCADE,
      badge_svg      TEXT NOT NULL,
      badge_hash     TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, course_id)
    );
    CREATE INDEX IF NOT EXISTS idx_certificate_badges_application_id
      ON certificate_badges(application_id);
  `);

  // Add selected_tier to course_nft_applications if not present
  const appCols = db.prepare("PRAGMA table_info('course_nft_applications')").all() as { name: string }[];
  if (!appCols.some((c) => c.name === 'selected_tier')) {
    try {
      db.exec("ALTER TABLE course_nft_applications ADD COLUMN selected_tier TEXT NOT NULL DEFAULT 'paid'");
    } catch {
      // Column already exists
    }
  }

  // Add tiers_enabled to course_pricing if not present
  const pricingCols = db.prepare("PRAGMA table_info('course_pricing')").all() as { name: string }[];
  if (!pricingCols.some((c) => c.name === 'tiers_enabled')) {
    try {
      db.exec("ALTER TABLE course_pricing ADD COLUMN tiers_enabled TEXT NOT NULL DEFAULT 'both'");
    } catch {
      // Column already exists
    }
  }
}
ensureBadgesTables();

// ─── Phase 11 C3: Sponsor Cohorts ───────────────────────────────────────────
function ensureCohortTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsor_cohorts (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      sponsor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      selected_tier    TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
      payment_id       TEXT REFERENCES payments(id) ON DELETE SET NULL,
      status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_course ON sponsor_cohorts(course_id);
    CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_sponsor ON sponsor_cohorts(sponsor_user_id);

    CREATE TABLE IF NOT EXISTS cohort_members (
      cohort_id       TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      added_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (cohort_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
  `);

  // Phase 22 C2: Add start_date/end_date columns + status log
  const cols = db.pragma('table_info(sponsor_cohorts)') as Array<{ name: string }>;
  const colNames = cols.map((c) => c.name);
  if (!colNames.includes('start_date')) {
    db.exec(`ALTER TABLE sponsor_cohorts ADD COLUMN start_date TEXT DEFAULT NULL`);
  }
  if (!colNames.includes('end_date')) {
    db.exec(`ALTER TABLE sponsor_cohorts ADD COLUMN end_date TEXT DEFAULT NULL`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS cohort_status_log (
      id           TEXT PRIMARY KEY,
      cohort_id    TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
      from_status  TEXT NOT NULL,
      to_status    TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      reason       TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cohort_status_log_cohort ON cohort_status_log(cohort_id);
  `);
}
ensureCohortTables();

// ─── Phase 12 C1: Paystack payment automation ────────────────────────────────
function ensurePaystackColumns(): void {
  // Add Paystack/Stellar columns to payments if not present
  const paymentCols = db.prepare("PRAGMA table_info('payments')").all() as { name: string }[];
  const addCol = (col: string, type: string) => {
    if (!paymentCols.some((c) => c.name === col)) {
      try { db.exec(`ALTER TABLE payments ADD COLUMN ${col} ${type}`); } catch { /* exists */ }
    }
  };
  addCol('paystack_reference', 'TEXT');
  addCol('paystack_access_code', 'TEXT');
  addCol('stellar_tx_hash', 'TEXT');
  addCol('stellar_memo', 'TEXT');

  // Add Stellar pricing columns to course_pricing
  const pricingCols = db.prepare("PRAGMA table_info('course_pricing')").all() as { name: string }[];
  if (!pricingCols.some((c) => c.name === 'stellar_price_xlm')) {
    try { db.exec('ALTER TABLE course_pricing ADD COLUMN stellar_price_xlm REAL'); } catch { /* exists */ }
  }
  if (!pricingCols.some((c) => c.name === 'stellar_price_usdc')) {
    try { db.exec('ALTER TABLE course_pricing ADD COLUMN stellar_price_usdc REAL'); } catch { /* exists */ }
  }

  // Create webhook_events table for idempotent webhook processing
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id            TEXT PRIMARY KEY,
      event_id      TEXT NOT NULL UNIQUE,
      event_type    TEXT NOT NULL,
      provider      TEXT NOT NULL DEFAULT 'paystack',
      processed_at  TEXT NOT NULL DEFAULT (datetime('now')),
      payload       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
  `);
}
ensurePaystackColumns();

// ─── Phase 20 C1: Multi-Tenant Architecture ──────────────────────────────────
function ensureTenantTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_role TEXT NOT NULL DEFAULT 'member' CHECK (tenant_role IN ('admin', 'lecturer', 'member')),
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
  `);

  // Add tenant_id to courses (nullable, backward compatible)
  const courseSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='courses'").get() as { sql: string } | undefined;
  if (courseSql && !courseSql.sql.includes('tenant_id')) {
    db.exec(`ALTER TABLE courses ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses(tenant_id)`);
  }
}
ensureTenantTables();

// ─── Phase 22 C3: Email Templates ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS email_templates (
    id         TEXT PRIMARY KEY,
    slug       TEXT NOT NULL UNIQUE,
    category   TEXT NOT NULL CHECK (category IN ('enrollment','auth','invitation','payment','cohort','certificate','admin')),
    name       TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body_html  TEXT NOT NULL,
    variables  TEXT NOT NULL DEFAULT '[]',
    version    INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_email_templates_slug ON email_templates(slug);
  CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
`);

// Seed default email templates (idempotent)
{
  const seedInsert = db.prepare(
    `INSERT OR IGNORE INTO email_templates (id, slug, category, name, subject, body_html, variables, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  );
  const seeds: Array<[string, string, string, string, string, string]> = [
    ['enrollment', 'enrollment', 'Course Enrollment',
     "You've been enrolled in {{courseName}}",
     `<p>Hi {{studentName}},</p>\n<p>You have been enrolled in <strong>{{courseName}}</strong> on <strong>{{lmsName}}</strong>.</p>\n<p><a href="{{{loginUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to access your course</a></p>\n<p>If you have questions, contact your administrator.</p>`,
     '["studentName","courseName","lmsName","loginUrl"]'],
    ['password-reset', 'auth', 'Password Reset',
     'Reset your {{lmsName}} password',
     `<p>Hi {{userName}},</p>\n<p>We received a request to reset the password for your <strong>{{lmsName}}</strong> account.</p>\n<p><a href="{{{resetUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>\n<p>Or copy this link into your browser:</p>\n<p><code style="word-break:break-all;">{{{resetUrl}}}</code></p>\n<p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>`,
     '["userName","lmsName","resetUrl"]'],
    ['course-invitation', 'invitation', 'Course Invitation',
     "You've been invited to {{courseName}}",
     `<p>Hi,</p>\n<p>You have been invited to join <strong>{{courseName}}</strong> on <strong>{{lmsName}}</strong>.</p>\n<p>Click the button below to create your account and access the course immediately:</p>\n<p><a href="{{{signupUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Accept invitation &amp; sign up</a></p>\n<p>Or copy this link: <code>{{{signupUrl}}}</code></p>\n<p>This invitation link can be used once.</p>`,
     '["courseName","lmsName","signupUrl"]'],
    ['cohort-payment-reminder', 'payment', 'Cohort Payment Reminder',
     'Payment reminder for {{courseName}}',
     `<p>Hi {{studentName}},</p>\n<p>This is a reminder that payment is pending for <strong>{{courseName}}</strong> (cohort: {{cohortName}}) on <strong>{{lmsName}}</strong>.</p>\n<p><a href="{{{loginUrl}}}" style="display:inline-block;padding:10px 20px;background:#3d7a8c;color:#fff;border-radius:6px;text-decoration:none;">Sign in to complete payment</a></p>\n<p>If you have questions, contact your administrator.</p>`,
     '["studentName","courseName","cohortName","lmsName","loginUrl"]'],
  ];
  for (const [slug, category, name, subject, bodyHtml, variables] of seeds) {
    seedInsert.run(uuidv4(), slug, category, name, subject, bodyHtml, variables);
  }
}

// ─── Phase 12B: Capability-based RBAC ─────────────────────────────────────────
function ensureRbacTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id         TEXT PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      label      TEXT NOT NULL,
      description TEXT,
      is_system  INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id         TEXT PRIMARY KEY,
      name       TEXT UNIQUE NOT NULL,
      category   TEXT NOT NULL,
      label      TEXT NOT NULL,
      description TEXT,
      is_system  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id    TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
    CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name);
  `);
}
ensureRbacTables();

export function seedRbacData(): void {
  // Seed built-in roles (idempotent)
  const roles: Array<[string, string, string, string]> = [
    ['role_student', 'student', 'Student', 'Base learner role'],
    ['role_supporter_student', 'supporter-student', 'Supporter Student', 'Completed paid course'],
    ['role_parent', 'parent', 'Parent', 'Family group manager'],
    ['role_teacher', 'teacher', 'Teacher', 'Classroom manager'],
    ['role_employer', 'employer', 'Employer', 'Team manager'],
    ['role_sponsor', 'sponsor', 'Sponsor', 'Cohort payment manager'],
    ['role_instructor', 'instructor', 'Instructor', 'Course creator and manager'],
    ['role_ta', 'teaching-assistant', 'Teaching Assistant', 'Graded permissions'],
    ['role_admin', 'admin', 'Administrator', 'Platform administrator'],
    ['role_admin2', 'admin-2', 'Extended Administrator', 'Custom role and user creation'],
    ['role_super_admin', 'super-admin', 'Super Administrator', 'Full system control'],
    ['role_custom', 'custom-user', 'Custom User', 'Custom permission set'],
  ];

  const insertRole = db.prepare(
    'INSERT OR IGNORE INTO roles (id, name, label, description, is_system) VALUES (?, ?, ?, ?, 1)'
  );
  for (const [id, name, label, desc] of roles) {
    insertRole.run(id, name, label, desc);
  }

  // Seed 60 permissions (idempotent)
  const perms: Array<[string, string, string, string]> = [
    // course (9)
    ['perm_course_view', 'course.view', 'course', 'View Courses'],
    ['perm_course_create', 'course.create', 'course', 'Create Courses'],
    ['perm_course_manage', 'course.manage', 'course', 'Manage Courses'],
    ['perm_course_delete', 'course.delete', 'course', 'Delete Courses'],
    ['perm_course_enroll', 'course.enroll', 'course', 'Enroll Self'],
    ['perm_course_enroll_others', 'course.enroll_others', 'course', 'Enroll Others'],
    ['perm_course_submit', 'course.submit', 'course', 'Submit Work'],
    ['perm_course_grade', 'course.grade', 'course', 'Grade Submissions'],
    ['perm_course_grade_pending', 'course.grade_pending', 'course', 'Grade (Pending Approval)'],
    // billing (7)
    ['perm_billing_view_own', 'billing.view_own', 'billing', 'View Own Payments'],
    ['perm_billing_view_assigned', 'billing.view_assigned', 'billing', 'View Assigned Payments'],
    ['perm_billing_view_all', 'billing.view_all', 'billing', 'View All Payments'],
    ['perm_billing_create', 'billing.create', 'billing', 'Create Payments'],
    ['perm_billing_confirm', 'billing.confirm', 'billing', 'Confirm Payments'],
    ['perm_billing_waive', 'billing.waive', 'billing', 'Waive Payments'],
    ['perm_billing_refund', 'billing.refund', 'billing', 'Refund Payments'],
    // wallet (4)
    ['perm_wallet_view_own', 'wallet.view_own', 'wallet', 'View Own Wallet'],
    ['perm_wallet_manage_own', 'wallet.manage_own', 'wallet', 'Manage Own Wallet'],
    ['perm_wallet_fund', 'wallet.fund', 'wallet', 'Fund Wallets'],
    ['perm_wallet_view_assigned', 'wallet.view_assigned', 'wallet', 'View Assigned Wallets'],
    // user (6)
    ['perm_user_view_self', 'user.view_self', 'user', 'View Own Profile'],
    ['perm_user_view_all', 'user.view_all', 'user', 'View All Users'],
    ['perm_user_create', 'user.create', 'user', 'Create Users'],
    ['perm_user_manage', 'user.manage', 'user', 'Manage Users'],
    ['perm_user_delete', 'user.delete', 'user', 'Delete Users'],
    ['perm_user_assign_role', 'user.assign_role', 'user', 'Assign Roles'],
    // cohort (6)
    ['perm_cohort_view_own', 'cohort.view_own', 'cohort', 'View Own Cohorts'],
    ['perm_cohort_view_all', 'cohort.view_all', 'cohort', 'View All Cohorts'],
    ['perm_cohort_create', 'cohort.create', 'cohort', 'Create Cohorts'],
    ['perm_cohort_manage', 'cohort.manage', 'cohort', 'Manage Cohorts'],
    ['perm_cohort_bulk_apply', 'cohort.bulk_apply', 'cohort', 'Bulk Apply'],
    ['perm_cohort_bulk_pay', 'cohort.bulk_pay', 'cohort', 'Bulk Pay'],
    // certificate (6)
    ['perm_certificate_view_own', 'certificate.view_own', 'certificate', 'View Own Certificates'],
    ['perm_certificate_apply', 'certificate.apply', 'certificate', 'Apply for Certificate'],
    ['perm_certificate_approve', 'certificate.approve', 'certificate', 'Approve Certificates'],
    ['perm_certificate_reject', 'certificate.reject', 'certificate', 'Reject Certificates'],
    ['perm_certificate_mint', 'certificate.mint', 'certificate', 'Mint NFT Certificates'],
    ['perm_certificate_badge_view', 'certificate.badge_view', 'certificate', 'View Badges'],
    // quiz (5)
    ['perm_quiz_view', 'quiz.view', 'quiz', 'View Quizzes'],
    ['perm_quiz_create', 'quiz.create', 'quiz', 'Create Quizzes'],
    ['perm_quiz_manage', 'quiz.manage', 'quiz', 'Manage Quizzes'],
    ['perm_quiz_submit', 'quiz.submit', 'quiz', 'Submit Quizzes'],
    ['perm_quiz_view_analytics', 'quiz.view_analytics', 'quiz', 'View Quiz Analytics'],
    // announcement (4)
    ['perm_announcement_view', 'announcement.view', 'announcement', 'View Announcements'],
    ['perm_announcement_create', 'announcement.create', 'announcement', 'Create Announcements'],
    ['perm_announcement_manage', 'announcement.manage', 'announcement', 'Manage Announcements'],
    ['perm_announcement_delete', 'announcement.delete', 'announcement', 'Delete Announcements'],
    // document (4)
    ['perm_document_view', 'document.view', 'document', 'View Documents'],
    ['perm_document_upload', 'document.upload', 'document', 'Upload Documents'],
    ['perm_document_manage', 'document.manage', 'document', 'Manage Documents'],
    ['perm_document_delete', 'document.delete', 'document', 'Delete Documents'],
    // forum (3)
    ['perm_forum_view', 'forum.view', 'forum', 'View Forum'],
    ['perm_forum_post', 'forum.post', 'forum', 'Post in Forum'],
    ['perm_forum_moderate', 'forum.moderate', 'forum', 'Moderate Forum'],
    // reward (3)
    ['perm_reward_view_own', 'reward.view_own', 'reward', 'View Own Rewards'],
    ['perm_reward_give', 'reward.give', 'reward', 'Give Rewards'],
    ['perm_reward_manage', 'reward.manage', 'reward', 'Manage Rewards'],
    // system (3)
    ['perm_system_manage_roles', 'system.manage_roles', 'system', 'Manage Roles'],
    ['perm_system_manage_permissions', 'system.manage_permissions', 'system', 'Manage Permissions'],
    ['perm_system_view_audit_log', 'system.view_audit_log', 'system', 'View Audit Log'],
    // tenant (2)
    ['perm_tenant_manage', 'tenant.manage', 'tenant', 'Manage Tenants'],
    ['perm_tenant_view', 'tenant.view', 'tenant', 'View Tenants'],
    // email (1)
    ['perm_email_manage', 'email.manage', 'email', 'Manage Email Templates'],
  ];

  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (id, name, category, label, is_system) VALUES (?, ?, ?, ?, 1)'
  );
  for (const [id, name, cat, label] of perms) {
    insertPerm.run(id, name, cat, label);
  }

  // Role-permission mappings (full matrix from spec)
  const mappings: Record<string, string[]> = {
    role_student: [
      'perm_course_view', 'perm_course_enroll', 'perm_course_submit',
      'perm_billing_view_own', 'perm_wallet_view_own', 'perm_user_view_self',
      'perm_certificate_view_own', 'perm_certificate_apply', 'perm_certificate_badge_view',
      'perm_quiz_view', 'perm_quiz_submit',
      'perm_announcement_view', 'perm_document_view',
      'perm_forum_view', 'perm_forum_post',
      'perm_reward_view_own',
    ],
    role_supporter_student: [
      'perm_course_view', 'perm_course_enroll', 'perm_course_submit', 'perm_course_grade_pending',
      'perm_billing_view_own', 'perm_wallet_view_own', 'perm_user_view_self',
      'perm_certificate_view_own', 'perm_certificate_apply', 'perm_certificate_badge_view',
      'perm_quiz_view', 'perm_quiz_submit',
      'perm_announcement_view', 'perm_document_view',
      'perm_forum_view', 'perm_forum_post',
      'perm_reward_view_own',
    ],
    role_parent: [
      'perm_course_view',
      'perm_billing_view_assigned', 'perm_wallet_view_assigned', 'perm_wallet_fund',
      'perm_user_view_self', 'perm_user_create',
      'perm_certificate_view_own', 'perm_quiz_view',
      'perm_announcement_view', 'perm_document_view', 'perm_forum_view',
      'perm_reward_view_own', 'perm_reward_give',
    ],
    role_teacher: [
      'perm_course_view', 'perm_course_manage',
      'perm_billing_view_assigned', 'perm_wallet_fund',
      'perm_user_view_self', 'perm_user_create',
      'perm_cohort_view_own', 'perm_certificate_view_own',
      'perm_quiz_view', 'perm_quiz_create',
      'perm_announcement_view', 'perm_announcement_create',
      'perm_document_view', 'perm_document_upload',
      'perm_forum_view', 'perm_forum_post',
      'perm_reward_view_own', 'perm_reward_give',
    ],
    role_employer: [
      'perm_course_view',
      'perm_billing_view_assigned', 'perm_wallet_fund',
      'perm_user_view_self', 'perm_user_create',
      'perm_cohort_view_own', 'perm_cohort_create',
      'perm_certificate_view_own', 'perm_quiz_view',
      'perm_announcement_view', 'perm_document_view', 'perm_forum_view',
      'perm_reward_view_own', 'perm_reward_give',
    ],
    role_sponsor: [
      'perm_course_view',
      'perm_billing_view_all', 'perm_wallet_fund', 'perm_user_view_self',
      'perm_cohort_view_own', 'perm_cohort_view_all', 'perm_cohort_create',
      'perm_cohort_manage', 'perm_cohort_bulk_apply', 'perm_cohort_bulk_pay',
      'perm_certificate_view_own', 'perm_quiz_view',
      'perm_announcement_view', 'perm_document_view', 'perm_forum_view',
      'perm_reward_view_own', 'perm_reward_give',
    ],
    role_instructor: [
      'perm_course_view', 'perm_course_create', 'perm_course_manage',
      'perm_course_grade', 'perm_course_enroll_others',
      'perm_billing_view_own', 'perm_wallet_view_own',
      'perm_user_view_self', 'perm_user_view_all',
      'perm_certificate_approve', 'perm_certificate_reject', 'perm_certificate_view_own',
      'perm_quiz_view', 'perm_quiz_create', 'perm_quiz_manage', 'perm_quiz_view_analytics',
      'perm_announcement_view', 'perm_announcement_create',
      'perm_document_view', 'perm_document_upload', 'perm_document_manage',
      'perm_forum_view', 'perm_forum_post', 'perm_forum_moderate',
      'perm_reward_view_own',
    ],
    role_ta: [
      'perm_course_view', 'perm_course_grade_pending',
      'perm_user_view_self', 'perm_certificate_view_own',
      'perm_quiz_view', 'perm_announcement_view', 'perm_document_view',
      'perm_forum_view', 'perm_forum_post',
    ],
    role_admin: [
      // course: all
      'perm_course_view', 'perm_course_create', 'perm_course_manage', 'perm_course_delete',
      'perm_course_enroll', 'perm_course_enroll_others', 'perm_course_submit',
      'perm_course_grade', 'perm_course_grade_pending',
      // billing: view_all, confirm, waive
      'perm_billing_view_own', 'perm_billing_view_all', 'perm_billing_confirm', 'perm_billing_waive',
      // wallet: view_own, manage_own
      'perm_wallet_view_own', 'perm_wallet_manage_own',
      // user: view_all, create, manage
      'perm_user_view_self', 'perm_user_view_all', 'perm_user_create', 'perm_user_manage',
      // cohort: view_all, create, manage
      'perm_cohort_view_own', 'perm_cohort_view_all', 'perm_cohort_create', 'perm_cohort_manage',
      // certificate: all
      'perm_certificate_view_own', 'perm_certificate_apply', 'perm_certificate_approve',
      'perm_certificate_reject', 'perm_certificate_mint', 'perm_certificate_badge_view',
      // quiz: all
      'perm_quiz_view', 'perm_quiz_create', 'perm_quiz_manage', 'perm_quiz_submit', 'perm_quiz_view_analytics',
      // announcement: all
      'perm_announcement_view', 'perm_announcement_create', 'perm_announcement_manage', 'perm_announcement_delete',
      // document: all
      'perm_document_view', 'perm_document_upload', 'perm_document_manage', 'perm_document_delete',
      // forum: all
      'perm_forum_view', 'perm_forum_post', 'perm_forum_moderate',
      // reward: all
      'perm_reward_view_own', 'perm_reward_give', 'perm_reward_manage',
      // system: view_audit_log
      'perm_system_view_audit_log',
      // tenant: view
      'perm_tenant_view',
      // email
      'perm_email_manage',
    ],
    role_admin2: [
      // course: all
      'perm_course_view', 'perm_course_create', 'perm_course_manage', 'perm_course_delete',
      'perm_course_enroll', 'perm_course_enroll_others', 'perm_course_submit',
      'perm_course_grade', 'perm_course_grade_pending',
      // billing: all
      'perm_billing_view_own', 'perm_billing_view_assigned', 'perm_billing_view_all',
      'perm_billing_create', 'perm_billing_confirm', 'perm_billing_waive', 'perm_billing_refund',
      // wallet: manage_own
      'perm_wallet_view_own', 'perm_wallet_manage_own',
      // user: all + assign_role
      'perm_user_view_self', 'perm_user_view_all', 'perm_user_create',
      'perm_user_manage', 'perm_user_delete', 'perm_user_assign_role',
      // cohort: all
      'perm_cohort_view_own', 'perm_cohort_view_all', 'perm_cohort_create',
      'perm_cohort_manage', 'perm_cohort_bulk_apply', 'perm_cohort_bulk_pay',
      // certificate: all
      'perm_certificate_view_own', 'perm_certificate_apply', 'perm_certificate_approve',
      'perm_certificate_reject', 'perm_certificate_mint', 'perm_certificate_badge_view',
      // quiz: all
      'perm_quiz_view', 'perm_quiz_create', 'perm_quiz_manage', 'perm_quiz_submit', 'perm_quiz_view_analytics',
      // announcement: all
      'perm_announcement_view', 'perm_announcement_create', 'perm_announcement_manage', 'perm_announcement_delete',
      // document: all
      'perm_document_view', 'perm_document_upload', 'perm_document_manage', 'perm_document_delete',
      // forum: all
      'perm_forum_view', 'perm_forum_post', 'perm_forum_moderate',
      // reward: all
      'perm_reward_view_own', 'perm_reward_give', 'perm_reward_manage',
      // system: manage_roles, view_audit_log
      'perm_system_manage_roles', 'perm_system_view_audit_log',
      // tenant: view
      'perm_tenant_view',
      // email
      'perm_email_manage',
    ],
    role_super_admin: [
      // All 60 permissions
      'perm_course_view', 'perm_course_create', 'perm_course_manage', 'perm_course_delete',
      'perm_course_enroll', 'perm_course_enroll_others', 'perm_course_submit',
      'perm_course_grade', 'perm_course_grade_pending',
      'perm_billing_view_own', 'perm_billing_view_assigned', 'perm_billing_view_all',
      'perm_billing_create', 'perm_billing_confirm', 'perm_billing_waive', 'perm_billing_refund',
      'perm_wallet_view_own', 'perm_wallet_manage_own', 'perm_wallet_fund', 'perm_wallet_view_assigned',
      'perm_user_view_self', 'perm_user_view_all', 'perm_user_create',
      'perm_user_manage', 'perm_user_delete', 'perm_user_assign_role',
      'perm_cohort_view_own', 'perm_cohort_view_all', 'perm_cohort_create',
      'perm_cohort_manage', 'perm_cohort_bulk_apply', 'perm_cohort_bulk_pay',
      'perm_certificate_view_own', 'perm_certificate_apply', 'perm_certificate_approve',
      'perm_certificate_reject', 'perm_certificate_mint', 'perm_certificate_badge_view',
      'perm_quiz_view', 'perm_quiz_create', 'perm_quiz_manage', 'perm_quiz_submit', 'perm_quiz_view_analytics',
      'perm_announcement_view', 'perm_announcement_create', 'perm_announcement_manage', 'perm_announcement_delete',
      'perm_document_view', 'perm_document_upload', 'perm_document_manage', 'perm_document_delete',
      'perm_forum_view', 'perm_forum_post', 'perm_forum_moderate',
      'perm_reward_view_own', 'perm_reward_give', 'perm_reward_manage',
      'perm_system_manage_roles', 'perm_system_manage_permissions', 'perm_system_view_audit_log',
      // tenant: all
      'perm_tenant_manage', 'perm_tenant_view',
      // email
      'perm_email_manage',
    ],
    // custom-user role: no default permissions (assigned per custom role)
  };

  const insertMapping = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
  );
  for (const [roleId, permIds] of Object.entries(mappings)) {
    for (const permId of permIds) {
      insertMapping.run(roleId, permId);
    }
  }
}
seedRbacData();

export function migrateUsersToRbac(): void {
  // Map existing users.role → user_roles (idempotent)
  const roleMap: Record<string, string> = {
    student: 'role_student',
    lecturer: 'role_instructor',
    admin: 'role_admin',
  };

  const users = db.prepare('SELECT id, role, email FROM users').all() as Array<{
    id: string; role: string; email: string;
  }>;

  const insertUserRole = db.prepare(
    'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)'
  );

  for (const user of users) {
    const roleId = roleMap[user.role];
    if (roleId) {
      insertUserRole.run(user.id, roleId);
    }
    // Super-admin for hardcoded email
    if (user.email === 'mukhtar.meer@smwebsystems.com') {
      insertUserRole.run(user.id, 'role_super_admin');
    }
  }
}
migrateUsersToRbac();

function ensureHealthCheckPingsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_check_pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL
    );
  `);
}
ensureHealthCheckPingsTable();

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
  // Drop-and-recreate without reassigning `db` so ESM imports in test files
  // always reference the same object (avoids live-binding propagation issues).
  db.pragma('foreign_keys = OFF');
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[];
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  db.exec(schemaSQL);
  db.pragma('foreign_keys = ON');
}
