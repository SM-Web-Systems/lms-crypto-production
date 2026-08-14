-- SQLite schema for SM Web Systems LMS (run this in your server repo to fix "no such table: users")
-- Run: npm run db:schema  (uses this file by default)

-- Users table (auth); description = optional profile bio (Profile API)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'lecturer', 'admin')),
  description TEXT,
  clerk_user_id TEXT,
  walletAddress TEXT UNIQUE,
  -- Wallet linking state machine (written only in authController.register):
  --   'none'             — default; wallet not attempted yet, OR transient failure (timeout/5xx/CAPTCHA).
  --                        walletAddress is NULL. No banner shown.
  --   'linked'           — wallet provisioned successfully. walletAddress is set.
  --   'existing_account' — AmmaWallet returned 409 on register; email already on AmmaWallet.
  --                        walletAddress is NULL. Amber banner shown directing user to ammawallet.com.
  -- LMS course access is NEVER conditioned on wallet status.
  wallet_linking_status TEXT DEFAULT 'none' CHECK (wallet_linking_status IN ('none', 'linked', 'existing_account')),
  -- Password reset columns (added via migration for existing DBs)
  password_reset_token TEXT,
  password_reset_expires_at TEXT,
  password_changed_at TEXT,
  reward_balance_legacy_real REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
-- Partial unique index: only enforces uniqueness when a reset token is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  enrollment_number TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 8),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by_id TEXT REFERENCES users(id),
  feedback TEXT,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  week_id TEXT,
  item_id TEXT,
  grade_status TEXT DEFAULT 'direct' CHECK (grade_status IN ('direct', 'pending_approval', 'approved')),
  graded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Course documents table (course_ids = JSON array of course IDs for restriction; empty/null = open to all)
CREATE TABLE IF NOT EXISTS course_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_mime_type TEXT,
  course_ids TEXT,
  week_id TEXT,
  uploaded_by_id TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);
CREATE INDEX IF NOT EXISTS idx_students_semester ON students(semester);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_course ON submissions(course_id);
CREATE INDEX IF NOT EXISTS idx_submissions_course_week ON submissions(course_id, week_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON course_documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON course_documents(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON course_documents(uploaded_by_id);

-- Forum tables
CREATE TABLE IF NOT EXISTS forum_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NULL REFERENCES courses(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_topics_author ON forum_topics(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_topics_course_id ON forum_topics(course_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_topic ON forum_posts(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts(author_id);

-- Phase 20 C1: Multi-Tenant Architecture
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

-- Courses table (Course API: title, description, sections, course_code for access)
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  course_code TEXT UNIQUE NOT NULL,
  sections TEXT NOT NULL DEFAULT '[]',
  sponsor_label TEXT,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  approval_status TEXT DEFAULT 'published'
);
CREATE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code);
CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses(tenant_id);

-- User course codes (which courses a user can access; replaces enrollment for access control)
CREATE TABLE IF NOT EXISTS user_course_codes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  PRIMARY KEY (user_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_user_course_codes_user ON user_course_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_codes_code ON user_course_codes(course_code);

-- Course enrollments (legacy/roster; kept for compatibility; members can be derived from user_course_codes)
CREATE TABLE IF NOT EXISTS course_enrollments (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id);

-- Messages API: 1:1 conversations (user1_id < user2_id for stable ordering)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user1_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id);

-- Quizzes (admin-managed; completions per user)
CREATE TABLE IF NOT EXISTS quizzes (
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

CREATE TABLE IF NOT EXISTS quiz_completions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  payment_status TEXT DEFAULT 'none',
  completed_at TEXT DEFAULT (datetime('now')),
  UNIQUE (quiz_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_completions_user ON quiz_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_completions_quiz ON quiz_completions(quiz_id);

-- NFT credential mints (Soroban SEP-50; one credential row per user per quiz OR per course)
-- quiz_id is nullable: quiz-level mints set it; course-level mints leave it NULL
CREATE TABLE IF NOT EXISTS nft_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  mint_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (mint_status IN ('pending', 'minted', 'failed')),
  tx_hash TEXT,
  error TEXT,
  contract_id TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'public',
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
  is_superseded INTEGER NOT NULL DEFAULT 0,
  soroban_token_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, quiz_id)
);
CREATE INDEX IF NOT EXISTS idx_nft_credentials_user ON nft_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_credentials_status ON nft_credentials(mint_status);
CREATE INDEX IF NOT EXISTS idx_nft_credentials_course ON nft_credentials(course_id);

-- Phase A: course_lecturers — maps lecturers to courses
CREATE TABLE IF NOT EXISTS course_lecturers (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_lecturers_user   ON course_lecturers(user_id);
CREATE INDEX IF NOT EXISTS idx_course_lecturers_course ON course_lecturers(course_id);

-- Phase A: lesson_completions — per-user per-item completion tracking
CREATE TABLE IF NOT EXISTS lesson_completions (
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
CREATE INDEX IF NOT EXISTS idx_lesson_completions_user_course ON lesson_completions(user_id, course_id);

-- Phase A: course_completion_requirements — per-course NFT eligibility rules
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

-- Phase A: course_nft_applications — student applies; lecturer recommends; admin approves/mints
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
  credential_id      TEXT REFERENCES nft_credentials(id) ON DELETE SET NULL,
  payment_id         TEXT,
  selected_tier      TEXT NOT NULL DEFAULT 'paid'
);
CREATE INDEX IF NOT EXISTS idx_nft_apps_user_course ON course_nft_applications(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_nft_apps_status      ON course_nft_applications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_apps_active
  ON course_nft_applications(user_id, course_id)
  WHERE status NOT IN ('rejected', 'minted');

-- Audit log for admin mutations (LMS-ADM-001/006)
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

-- Phase 7 C2: In-app notifications
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

-- Phase 11 C1a: Certificate pricing + payments
CREATE TABLE IF NOT EXISTS course_pricing (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'USD',
  is_active   INTEGER NOT NULL DEFAULT 1,
  tiers_enabled TEXT NOT NULL DEFAULT 'both',
  stellar_price_xlm  REAL,
  stellar_price_usdc REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_course_pricing_course_id ON course_pricing(course_id);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  payment_method  TEXT NOT NULL DEFAULT 'manual',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'waived', 'failed', 'refunded')),
  confirmed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at    TEXT,
  notes           TEXT,
  paystack_reference  TEXT,
  paystack_access_code TEXT,
  stellar_tx_hash TEXT,
  stellar_memo    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);
CREATE INDEX IF NOT EXISTS idx_payments_application_id ON payments(application_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Phase F4: disputes — payment dispute / refund workflow
CREATE TABLE IF NOT EXISTS disputes (
  id              TEXT PRIMARY KEY,
  payment_id      TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  reason          TEXT NOT NULL,
  resolution_note TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  resolved_by     TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- Phase 11 C2: certificate_badges — free-tier SVG badge storage
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

-- Phase 11 C3: sponsor_cohorts — named student groups per course
CREATE TABLE IF NOT EXISTS sponsor_cohorts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  sponsor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  selected_tier    TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
  payment_id       TEXT REFERENCES payments(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  start_date       TEXT DEFAULT NULL,
  end_date         TEXT DEFAULT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_course ON sponsor_cohorts(course_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_sponsor ON sponsor_cohorts(sponsor_user_id);

-- Phase 11 C3: cohort_members — membership link table
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id       TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);

-- Phase 22 C2: cohort status transition audit log
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

-- Phase 12B: Capability-based RBAC
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

-- Auto-map users.role → user_roles on INSERT (bridges legacy role column to RBAC)
CREATE TRIGGER IF NOT EXISTS trg_auto_assign_user_role
AFTER INSERT ON users
FOR EACH ROW
WHEN NEW.role IN ('student', 'lecturer', 'admin')
BEGIN
  INSERT OR IGNORE INTO user_roles (user_id, role_id)
  VALUES (
    NEW.id,
    CASE NEW.role
      WHEN 'student' THEN 'role_student'
      WHEN 'lecturer' THEN 'role_instructor'
      WHEN 'admin' THEN 'role_admin'
    END
  );
END;

-- Phase 12 C1: Paystack webhook audit trail
CREATE TABLE IF NOT EXISTS webhook_events (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL UNIQUE,
  event_type    TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'paystack',
  processed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  payload       TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- Phase 22 C3: Email templates
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

-- Phase 23 C3: Notification preferences (per-type opt-out)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, type)
);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON notification_preferences(user_id);

-- Phase 23 C1: Readiness probe write-path test table
CREATE TABLE IF NOT EXISTS health_check_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL
);

-- Phase A: Tenant settings (super-student threshold)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  super_student_threshold INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phase A: User links (parent/teacher/employer → student relationships)
CREATE TABLE IF NOT EXISTS user_links (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('parent', 'teacher', 'employer', 'sponsor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_user_id, child_user_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_user_links_parent ON user_links(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_user_links_child ON user_links(child_user_id);

-- Phase A: User groups (family/class/team)
CREATE TABLE IF NOT EXISTS user_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('family', 'class', 'team')),
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);

-- Phase A: Login history
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  auth_method TEXT CHECK (auth_method IN ('local', 'ammawallet', 'sso'))
);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);

-- Phase A: Course approval workflow
CREATE TABLE IF NOT EXISTS course_approval_workflow (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id),
  review_note TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phase D: TA assignments
CREATE TABLE IF NOT EXISTS course_tas (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_tas_user ON course_tas(user_id);

-- Phase D: TA material staging
CREATE TABLE IF NOT EXISTS course_material_submissions (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  submitter_id  TEXT NOT NULL REFERENCES users(id),
  section_id    TEXT NOT NULL,
  item_title    TEXT NOT NULL,
  item_type     TEXT NOT NULL DEFAULT 'text' CHECK (item_type IN ('text', 'video', 'audio', 'document', 'quiz', 'assignment', 'download')),
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   TEXT REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reward System (R2): accounts, rewards, allocations, transactions, eligibility, outbox
CREATE TABLE IF NOT EXISTS reward_accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_type      TEXT NOT NULL CHECK (account_type IN ('funder', 'recipient', 'platform')),
  available_stroops INTEGER NOT NULL DEFAULT 0 CHECK (available_stroops >= 0),
  reserved_stroops  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stroops >= 0),
  currency_code     TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, account_type, currency_code)
);
CREATE INDEX IF NOT EXISTS idx_reward_accounts_user ON reward_accounts(user_id);

CREATE TABLE IF NOT EXISTS rewards (
  id                    TEXT PRIMARY KEY,
  creator_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope_type            TEXT NOT NULL CHECK (scope_type IN (
    'sponsor_cohort', 'employer_team', 'parent_child', 'parent_family', 'teacher_class'
  )),
  scope_id              TEXT NOT NULL,
  reward_type           TEXT NOT NULL CHECK (reward_type IN (
    'individual', 'milestone', 'course_completion', 'grade', 'custom'
  )),
  amount_mode           TEXT NOT NULL DEFAULT 'per_recipient' CHECK (amount_mode IN ('per_recipient')),
  amount_stroops        INTEGER NOT NULL CHECK (amount_stroops > 0),
  max_recipients        INTEGER CHECK (max_recipients IS NULL OR max_recipients > 0),
  currency_code         TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  description           TEXT,
  auto_release          INTEGER NOT NULL DEFAULT 0 CHECK (auto_release IN (0, 1)),
  eligibility_config    TEXT,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_funding', 'funded', 'active',
    'eligible_pending_approval', 'approved', 'eligible_auto_release',
    'partially_released', 'released',
    'cancelled', 'expired',
    'partially_refunded', 'refunded'
  )),
  idempotency_key       TEXT NOT NULL UNIQUE,
  expires_at            TEXT,
  funded_at             TEXT,
  activated_at          TEXT,
  eligible_at           TEXT,
  approved_at           TEXT,
  released_at           TEXT,
  cancelled_at          TEXT,
  refunded_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rewards_creator ON rewards(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_scope ON rewards(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON rewards(status);

CREATE TABLE IF NOT EXISTS reward_audience_snapshots (
  id              TEXT PRIMARY KEY,
  reward_id       TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  snapshot_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reward_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_audience_reward ON reward_audience_snapshots(reward_id);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id                TEXT PRIMARY KEY,
  reward_id         TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  student_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_stroops    INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code     TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'eligible', 'released', 'cancelled', 'refunded'
  )),
  idempotency_key   TEXT NOT NULL UNIQUE,
  eligible_at       TEXT,
  released_at       TEXT,
  cancelled_at      TEXT,
  refunded_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reward_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_allocations_reward ON reward_allocations(reward_id);
CREATE INDEX IF NOT EXISTS idx_reward_allocations_student ON reward_allocations(student_user_id);

CREATE TABLE IF NOT EXISTS reward_transactions (
  id                       TEXT PRIMARY KEY,
  reward_id                TEXT REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id            TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,
  source_account_type      TEXT NOT NULL CHECK (source_account_type IN ('external', 'platform', 'funder', 'recipient')),
  source_bucket            TEXT CHECK (source_bucket IN ('available', 'reserved')),
  source_user_id           TEXT REFERENCES users(id) ON DELETE RESTRICT,
  destination_account_type TEXT NOT NULL CHECK (destination_account_type IN ('funder', 'recipient', 'platform')),
  destination_bucket       TEXT NOT NULL CHECK (destination_bucket IN ('available', 'reserved')),
  destination_user_id      TEXT REFERENCES users(id) ON DELETE RESTRICT,
  actor_type               TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
  actor_user_id            TEXT REFERENCES users(id) ON DELETE RESTRICT,
  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),
  amount_stroops           INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code            TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  previous_state           TEXT NOT NULL,
  new_state                TEXT NOT NULL,
  funding_source_type      TEXT CHECK (funding_source_type IN ('platform_credit', 'admin_grant', 'stellar', 'paystack')),
  funding_reference        TEXT,
  source_event_id          TEXT,
  idempotency_key          TEXT NOT NULL UNIQUE,
  reason                   TEXT,
  metadata                 TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((actor_type = 'system' AND actor_user_id IS NULL) OR (actor_type = 'user' AND actor_user_id IS NOT NULL)),
  CHECK ((transaction_type = 'fund' AND funding_source_type IS NOT NULL) OR (transaction_type != 'fund')),
  CHECK ((transaction_type IN ('release', 'refund') AND allocation_id IS NOT NULL AND destination_user_id IS NOT NULL) OR (transaction_type NOT IN ('release', 'refund'))),
  CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire'))),
  CHECK ((transaction_type = 'fund' AND destination_user_id IS NOT NULL AND destination_account_type = 'funder') OR (transaction_type != 'fund'))
);
CREATE INDEX IF NOT EXISTS idx_reward_txn_reward ON reward_transactions(reward_id);
CREATE INDEX IF NOT EXISTS idx_reward_txn_allocation ON reward_transactions(allocation_id);
CREATE INDEX IF NOT EXISTS idx_reward_txn_idem ON reward_transactions(idempotency_key);

CREATE TABLE IF NOT EXISTS reward_eligibility_events (
  id              TEXT PRIMARY KEY,
  reward_id       TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id   TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,
  event_type      TEXT NOT NULL CHECK (event_type IN ('course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom')),
  event_source_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evaluated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  result          TEXT NOT NULL CHECK (result IN ('eligible', 'ineligible', 'already_processed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  UNIQUE(reward_id, event_type, event_source_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_elig_reward ON reward_eligibility_events(reward_id);

CREATE TABLE IF NOT EXISTS reward_event_outbox (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL CHECK (event_type IN ('course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom')),
  event_source_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_data      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  completed_at    TEXT,
  error_message   TEXT,
  next_attempt_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_type, event_source_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_outbox_status ON reward_event_outbox(status);

CREATE TABLE IF NOT EXISTS reward_refund_attempts (
  id                       TEXT PRIMARY KEY,
  reward_id                TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id            TEXT NOT NULL REFERENCES reward_allocations(id) ON DELETE RESTRICT,
  attempted_by_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attempted_amount_stroops INTEGER NOT NULL CHECK (attempted_amount_stroops > 0),
  currency_code            TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  recipient_available_stroops INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'resolved')),
  resolution               TEXT CHECK (resolution IN ('retried_success', 'waived', 'escalated')),
  resolved_at              TEXT,
  resolved_by_user_id      TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refund_attempts_reward ON reward_refund_attempts(reward_id);
CREATE INDEX IF NOT EXISTS idx_refund_attempts_status ON reward_refund_attempts(status);

CREATE TABLE IF NOT EXISTS scheduler_locks (
  lock_name    TEXT PRIMARY KEY,
  holder_id    TEXT NOT NULL,
  acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduler_tick_log (
  id               TEXT PRIMARY KEY,
  started_at       TEXT NOT NULL,
  completed_at     TEXT,
  duration_ms      INTEGER,
  result           TEXT NOT NULL CHECK (result IN ('success', 'partial', 'error', 'skipped')),
  outbox_processed INTEGER DEFAULT 0,
  outbox_failed    INTEGER DEFAULT 0,
  expiry_processed INTEGER DEFAULT 0,
  expiry_failed    INTEGER DEFAULT 0,
  error_message    TEXT
);

CREATE TABLE IF NOT EXISTS reward_refund_audit_log (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL REFERENCES reward_refund_attempts(id) ON DELETE RESTRICT,
  reward_id       TEXT NOT NULL,
  allocation_id   TEXT NOT NULL,
  actor_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action          TEXT NOT NULL CHECK (action IN ('retry', 'waive', 'escalate')),
  resolution_type TEXT CHECK (resolution_type IN ('retried_success', 'waived', 'escalated')),
  amount_stroops  INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refund_audit_attempt ON reward_refund_audit_log(attempt_id);

-- Phase A: Perks marketplace
CREATE TABLE IF NOT EXISTS perks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  expires_at TEXT,
  max_claims INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS perk_claims (
  id TEXT PRIMARY KEY,
  perk_id TEXT NOT NULL REFERENCES perks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(perk_id, user_id)
);

-- Phase E: System config
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id)
);

-- Phase F2: Session management
CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_hash ON active_sessions(token_hash);

-- Phase F3: GDPR data export
CREATE TABLE IF NOT EXISTS data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  file_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id);
