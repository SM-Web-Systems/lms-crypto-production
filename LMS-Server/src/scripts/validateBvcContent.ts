/**
 * BVC Course Content Integrity Validator
 *
 * Read-only validation of the Blockchain Vibe Coding course structure,
 * media URLs, quiz configurations, and Markdown references.
 *
 * Guardrails:
 * - Read-only: no content mutation, no database writes.
 * - No production credentials or secrets.
 * - No container/deployment/migration side-effects.
 *
 * Usage:
 *   # Inside Docker container (recommended for production DB):
 *   docker exec lms-api npx tsx src/scripts/validateBvcContent.ts
 *
 *   # With explicit DB path:
 *   npx tsx src/scripts/validateBvcContent.ts --db-path /app/data/student_ms.db
 *
 *   # Skip URL reachability checks (faster, offline-safe):
 *   docker exec lms-api npx tsx src/scripts/validateBvcContent.ts --skip-reachability
 *
 *   # Via npm script (inside container):
 *   docker exec lms-api npm run validate:bvc
 *
 * Expected BVC structure:
 * - 2 weeks, 7 sections (modules), 56 items (8 per module)
 * - 7 module quizzes + 1 final quiz (threshold 70%)
 * - YouTube-primary video/audio, GitHub media downloads
 * - Native Markdown lessons/study guides, flashcards, mind maps
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Types ──────────────────────────────────────────────────────────────

interface CourseItem {
  id: string;
  type: string;
  title: string;
  order?: number;
  url?: string;
  quizId?: string;
  fileUrl?: string;
  fileName?: string;
  downloadUrl?: string;
  youtubeUrl?: string;
  documentId?: string;
  description?: string;
  information?: string;
}

interface Section {
  id: string;
  title: string;
  objective?: string;
  outcome?: string;
  items: CourseItem[];
}

interface Week {
  id: string;
  title: string;
  order: number;
  sections: Section[];
}

interface QuizQuestion {
  id: string;
  type: string;
  order: number;
  question: string;
  options: string[];
  correctIndex: number;
  information?: string;
}

interface Quiz {
  id: string;
  title: string;
  course_id: string;
  passing_score: number;
  questions: string; // JSON string
}

interface CompletionRequirement {
  course_id: string;
  require_all_lessons: number;
  lesson_threshold: number;
  required_quiz_ids: string; // JSON string
  min_quiz_score: number;
  require_submissions: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const BVC_COURSE_ID = 'bvc-2026-0000-0000-000000000001';
const EXPECTED_WEEKS = 2;
const EXPECTED_SECTIONS = 7;
const EXPECTED_ITEMS = 56;
const ITEMS_PER_MODULE = 8;
const EXPECTED_MODULE_QUIZZES = 7;
const EXPECTED_PASSING_SCORE = 70;

const VALID_ITEM_TYPES = ['video', 'text', 'audio', 'quiz', 'link', 'download', 'pdf', 'assignment'];

const MODULE_ITEM_ORDER = [
  'video',     // 1
  'text',      // 2 - lesson
  'text',      // 3 - study guide
  'audio',     // 4
  'link',      // 5 - flashcards
  'link',      // 6 - mind map
  'download',  // 7 - infographic
  'quiz',      // 8
];

// ── Validation Result ──────────────────────────────────────────────────

type Severity = 'ERROR' | 'WARN' | 'INFO';

interface Finding {
  severity: Severity;
  category: string;
  message: string;
}

const findings: Finding[] = [];

function report(severity: Severity, category: string, message: string) {
  findings.push({ severity, category, message });
}

// ── Database (read-only) ───────────────────────────────────────────────

function parseDbPath(): string | undefined {
  const idx = process.argv.indexOf('--db-path');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function openDb(): Database.Database {
  const explicit = parseDbPath();
  if (explicit) {
    return new Database(explicit, { readonly: true });
  }

  // Try standard locations:
  // 1. ./data/student_ms.db (CWD, works inside Docker at /app/)
  // 2. Relative to script file
  const candidates = [
    path.resolve(process.cwd(), 'data/student_ms.db'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/student_ms.db'),
  ];

  for (const candidate of candidates) {
    try {
      const db = new Database(candidate, { readonly: true });
      // Verify we can actually read (WAL-locked DBs may open but fail on query)
      db.prepare('SELECT 1').get();
      return db;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    `Database not found or locked. Tried: ${candidates.join(', ')}\n` +
    'Hint: Run inside the Docker container:\n' +
    '  docker exec lms-api npx tsx src/scripts/validateBvcContent.ts',
  );
}

// ── Validators ─────────────────────────────────────────────────────────

function validateStructure(weeks: Week[]) {
  if (weeks.length !== EXPECTED_WEEKS) {
    report('ERROR', 'STRUCTURE', `Expected ${EXPECTED_WEEKS} weeks, found ${weeks.length}`);
  } else {
    report('INFO', 'STRUCTURE', `Week count: ${weeks.length}`);
  }

  const totalSections = weeks.reduce((sum, w) => sum + w.sections.length, 0);
  if (totalSections !== EXPECTED_SECTIONS) {
    report('ERROR', 'STRUCTURE', `Expected ${EXPECTED_SECTIONS} sections, found ${totalSections}`);
  } else {
    report('INFO', 'STRUCTURE', `Section count: ${totalSections}`);
  }

  const totalItems = weeks.reduce(
    (sum, w) => sum + w.sections.reduce((s, sec) => s + sec.items.length, 0),
    0,
  );
  if (totalItems !== EXPECTED_ITEMS) {
    report('ERROR', 'STRUCTURE', `Expected ${EXPECTED_ITEMS} items, found ${totalItems}`);
  } else {
    report('INFO', 'STRUCTURE', `Item count: ${totalItems}`);
  }

  let moduleIndex = 0;
  for (const week of weeks) {
    if (!week.id) report('ERROR', 'STRUCTURE', `Week missing id`);
    if (!week.title) report('ERROR', 'STRUCTURE', `Week missing title`);

    for (const section of week.sections) {
      moduleIndex++;
      if (!section.id) report('ERROR', 'STRUCTURE', `Module ${moduleIndex} missing id`);
      if (!section.title) report('ERROR', 'STRUCTURE', `Module ${moduleIndex} missing title`);

      if (section.items.length !== ITEMS_PER_MODULE) {
        report('WARN', 'STRUCTURE', `Module ${moduleIndex} "${section.title}": expected ${ITEMS_PER_MODULE} items, found ${section.items.length}`);
      }

      for (let i = 0; i < section.items.length && i < MODULE_ITEM_ORDER.length; i++) {
        const item = section.items[i];
        const expectedType = MODULE_ITEM_ORDER[i];
        if (item.type !== expectedType) {
          report('WARN', 'STRUCTURE', `Module ${moduleIndex} item ${i + 1}: expected type "${expectedType}", found "${item.type}"`);
        }
      }
    }
  }
}

function validateItems(weeks: Week[]) {
  let moduleIndex = 0;
  for (const week of weeks) {
    for (const section of week.sections) {
      moduleIndex++;
      for (const item of section.items) {
        const label = `Module ${moduleIndex} "${item.title}"`;

        if (!item.id) report('ERROR', 'ITEM', `${label}: missing id`);
        if (!item.title) report('ERROR', 'ITEM', `${label}: missing title`);
        if (!item.type) report('ERROR', 'ITEM', `${label}: missing type`);
        if (!VALID_ITEM_TYPES.includes(item.type)) {
          report('ERROR', 'ITEM', `${label}: unknown type "${item.type}"`);
        }

        switch (item.type) {
          case 'video':
            if (!item.url) report('ERROR', 'MEDIA', `${label}: video missing url`);
            break;
          case 'text':
            if (!item.url) report('WARN', 'MEDIA', `${label}: text item missing url`);
            break;
          case 'audio':
            if (!item.url) report('ERROR', 'MEDIA', `${label}: audio missing url`);
            break;
          case 'quiz':
            if (!item.quizId) report('ERROR', 'QUIZ', `${label}: quiz item missing quizId`);
            break;
          case 'link':
            if (!item.url) report('WARN', 'MEDIA', `${label}: link missing url`);
            break;
          case 'download':
            if (!item.fileUrl && !item.documentId) {
              report('WARN', 'MEDIA', `${label}: download missing fileUrl and documentId`);
            }
            break;
        }
      }
    }
  }
}

function validateMediaUrls(weeks: Week[]) {
  const urls: { label: string; url: string }[] = [];

  let moduleIndex = 0;
  for (const week of weeks) {
    for (const section of week.sections) {
      moduleIndex++;
      for (const item of section.items) {
        const label = `Module ${moduleIndex} "${item.title}"`;
        if (item.url) urls.push({ label, url: item.url });
        if (item.downloadUrl) urls.push({ label: `${label} (download)`, url: item.downloadUrl });
        if (item.fileUrl) urls.push({ label: `${label} (file)`, url: item.fileUrl });
      }
    }
  }

  report('INFO', 'MEDIA', `Total URLs to validate: ${urls.length}`);

  for (const { label, url } of urls) {
    try {
      new URL(url);
    } catch {
      report('ERROR', 'MEDIA', `${label}: invalid URL format: ${url}`);
      continue;
    }

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (!ytMatch) {
        report('WARN', 'MEDIA', `${label}: YouTube URL missing video ID: ${url}`);
      }
    }

    if (url.includes('raw.githubusercontent.com') || url.includes('github.com')) {
      if (!url.includes('SM-Web-Systems') && !url.includes('blockchain')) {
        report('WARN', 'MEDIA', `${label}: unexpected GitHub URL pattern: ${url}`);
      }
    }
  }
}

async function checkUrlReachability(weeks: Week[]) {
  const urls = new Set<string>();

  for (const week of weeks) {
    for (const section of week.sections) {
      for (const item of section.items) {
        if (item.url) urls.add(item.url);
        if (item.downloadUrl) urls.add(item.downloadUrl);
        if (item.fileUrl) urls.add(item.fileUrl);
      }
    }
  }

  report('INFO', 'REACHABILITY', `Checking ${urls.size} unique URLs (HEAD requests)...`);

  let reachable = 0;
  let unreachable = 0;

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (res.ok || res.status === 405) {
        reachable++;
      } else {
        report('WARN', 'REACHABILITY', `HTTP ${res.status} — ${url}`);
        unreachable++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report('WARN', 'REACHABILITY', `Unreachable — ${url}: ${msg}`);
      unreachable++;
    }
  }

  report('INFO', 'REACHABILITY', `Reachable: ${reachable}, Unreachable: ${unreachable}`);
}

function validateQuizzes(db: Database.Database, weeks: Week[]) {
  const quizIdsInCourse: string[] = [];
  for (const week of weeks) {
    for (const section of week.sections) {
      for (const item of section.items) {
        if (item.type === 'quiz' && item.quizId) {
          quizIdsInCourse.push(item.quizId);
        }
      }
    }
  }

  if (quizIdsInCourse.length !== EXPECTED_MODULE_QUIZZES) {
    report('WARN', 'QUIZ', `Expected ${EXPECTED_MODULE_QUIZZES} module quizzes in course items, found ${quizIdsInCourse.length}`);
  } else {
    report('INFO', 'QUIZ', `Module quiz count in items: ${quizIdsInCourse.length}`);
  }

  const allQuizIds = [...quizIdsInCourse];

  if (quizIdsInCourse.length > 0) {
    const placeholders = quizIdsInCourse.map(() => '?').join(',');
    const finalQuiz = db.prepare(
      `SELECT id FROM quizzes WHERE course_id = ? AND id NOT IN (${placeholders})`,
    ).all(BVC_COURSE_ID, ...quizIdsInCourse) as { id: string }[];

    for (const fq of finalQuiz) {
      allQuizIds.push(fq.id);
    }

    report('INFO', 'QUIZ', `Total quizzes for BVC course: ${allQuizIds.length} (${quizIdsInCourse.length} module + ${finalQuiz.length} final)`);
  } else {
    const allQuizzes = db.prepare('SELECT id FROM quizzes WHERE course_id = ?').all(BVC_COURSE_ID) as { id: string }[];
    for (const q of allQuizzes) allQuizIds.push(q.id);
    report('INFO', 'QUIZ', `Total quizzes for BVC course: ${allQuizIds.length}`);
  }

  for (const quizId of allQuizIds) {
    const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId) as Quiz | undefined;
    if (!quiz) {
      report('ERROR', 'QUIZ', `Quiz "${quizId}" referenced but not found in database`);
      continue;
    }

    if (quiz.course_id !== BVC_COURSE_ID) {
      report('ERROR', 'QUIZ', `Quiz "${quizId}" course_id mismatch: expected ${BVC_COURSE_ID}, got ${quiz.course_id}`);
    }

    if (quiz.passing_score !== EXPECTED_PASSING_SCORE) {
      report('WARN', 'QUIZ', `Quiz "${quizId}" passing_score: expected ${EXPECTED_PASSING_SCORE}, got ${quiz.passing_score}`);
    }

    let questions: QuizQuestion[];
    try {
      questions = JSON.parse(quiz.questions);
    } catch {
      report('ERROR', 'QUIZ', `Quiz "${quizId}": invalid questions JSON`);
      continue;
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      report('ERROR', 'QUIZ', `Quiz "${quizId}": empty or invalid questions array`);
      continue;
    }

    for (const q of questions) {
      if (!q.question) {
        report('ERROR', 'QUIZ', `Quiz "${quizId}" question "${q.id}": missing question text`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        report('ERROR', 'QUIZ', `Quiz "${quizId}" question "${q.id}": fewer than 2 options`);
      }
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= (q.options?.length ?? 0)) {
        report('ERROR', 'QUIZ', `Quiz "${quizId}" question "${q.id}": correctIndex out of range`);
      }
    }

    report('INFO', 'QUIZ', `Quiz "${quizId}" — ${questions.length} questions`);
  }
}

function validateCompletionRequirements(db: Database.Database) {
  const req = db.prepare(
    'SELECT * FROM course_completion_requirements WHERE course_id = ?',
  ).get(BVC_COURSE_ID) as CompletionRequirement | undefined;

  if (!req) {
    report('ERROR', 'COMPLETION', `No completion requirements found for BVC course`);
    return;
  }

  if (req.min_quiz_score !== EXPECTED_PASSING_SCORE) {
    report('WARN', 'COMPLETION', `min_quiz_score: expected ${EXPECTED_PASSING_SCORE}, got ${req.min_quiz_score}`);
  } else {
    report('INFO', 'COMPLETION', `min_quiz_score: ${req.min_quiz_score}%`);
  }

  let requiredQuizIds: string[];
  try {
    requiredQuizIds = JSON.parse(req.required_quiz_ids);
  } catch {
    report('ERROR', 'COMPLETION', `Invalid required_quiz_ids JSON`);
    return;
  }

  if (!Array.isArray(requiredQuizIds) || requiredQuizIds.length === 0) {
    report('WARN', 'COMPLETION', `No required quiz IDs specified`);
  } else {
    report('INFO', 'COMPLETION', `Required quiz IDs: ${requiredQuizIds.join(', ')}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const skipReachability = process.argv.includes('--skip-reachability');

  console.log('═══════════════════════════════════════════════════');
  console.log('  BVC Course Content Integrity Validator');
  console.log('═══════════════════════════════════════════════════');
  console.log();

  const db = openDb();

  const course = db.prepare('SELECT id, title, course_code, sections FROM courses WHERE id = ?')
    .get(BVC_COURSE_ID) as { id: string; title: string; course_code: string; sections: string } | undefined;

  if (!course) {
    console.error(`FATAL: BVC course ${BVC_COURSE_ID} not found in database.`);
    console.error('Hint: Ensure the database contains seeded course data.');
    process.exit(1);
  }

  console.log(`Course: ${course.title} (${course.course_code})`);
  console.log(`ID:     ${course.id}`);
  console.log();

  let weeks: Week[];
  try {
    weeks = JSON.parse(course.sections);
  } catch {
    console.error('FATAL: Could not parse course sections JSON.');
    process.exit(1);
  }

  validateStructure(weeks);
  validateItems(weeks);
  validateMediaUrls(weeks);
  validateQuizzes(db, weeks);
  validateCompletionRequirements(db);

  if (!skipReachability) {
    await checkUrlReachability(weeks);
  } else {
    report('INFO', 'REACHABILITY', 'Skipped (--skip-reachability flag)');
  }

  db.close();

  // Print report
  console.log();
  console.log('═══════════════════════════════════════════════════');
  console.log('  Validation Report');
  console.log('═══════════════════════════════════════════════════');
  console.log();

  const errors = findings.filter(f => f.severity === 'ERROR');
  const warnings = findings.filter(f => f.severity === 'WARN');
  const infos = findings.filter(f => f.severity === 'INFO');

  for (const f of errors) {
    console.log(`  ERROR   [${f.category}] ${f.message}`);
  }
  for (const f of warnings) {
    console.log(`  WARN    [${f.category}] ${f.message}`);
  }
  for (const f of infos) {
    console.log(`  INFO    [${f.category}] ${f.message}`);
  }

  console.log();
  console.log('───────────────────────────────────────────────────');
  console.log(`  Errors: ${errors.length}  |  Warnings: ${warnings.length}  |  Info: ${infos.length}`);
  console.log('───────────────────────────────────────────────────');

  if (errors.length > 0) {
    console.log();
    console.log('  RESULT: FAIL — content integrity errors detected.');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log();
    console.log('  RESULT: PASS WITH WARNINGS — review items above.');
    process.exit(0);
  } else {
    console.log();
    console.log('  RESULT: PASS — all checks passed.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
