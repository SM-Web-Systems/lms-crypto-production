/**
 * upgrade-bvc-course-v2.js — Convert BVC course to weeks format + YouTube videos
 *
 * Changes:
 *   1. Reorganize sections into Week 1 (Modules 1–4) and Week 2 (Modules 5–7)
 *   2. Update video items to use YouTube embed URLs (with local server fallback info)
 *   3. Add GitHub download links for video files
 *   4. Preserve all existing IDs (sections, items, quizzes)
 *   5. Preserve all student progress, quiz completions, NFT credentials
 *
 * Usage:
 *   DRY_RUN=1 node upgrade-bvc-course-v2.js   # Preview changes (no writes)
 *   node upgrade-bvc-course-v2.js              # Apply changes
 *
 * Run from host:
 *   docker cp upgrade-bvc-course-v2.js lms-api:/app/
 *   docker exec -w /app lms-api node upgrade-bvc-course-v2.js           # dry run by default
 *   docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-course-v2.js  # apply
 */

'use strict';

import Database from 'better-sqlite3';

const DB_PATH = '/app/data/student_ms.db';
const DRY_RUN = process.env.DRY_RUN !== '0';
const BVC_COURSE_ID = 'bvc-2026-0000-0000-000000000001';

// ── Verified YouTube mapping (durations confirmed via yt-dlp + ffprobe) ──────

const YOUTUBE_VIDEO_MAP = {
  1: { id: 'SyK8hJVq3_Q', title: "Blockchain Beginner's Guide - Module 1: Introduction to Blockchain", duration: 475 },
  2: { id: 'WIDvvPM3DfE', title: 'Module 2 - Technical Foundations of Blockchain', duration: 437 },
  3: { id: 'aLnRqlarcVo', title: 'Module 3: Bitcoin & Cryptocurrencies - Explainer Video', duration: 397 },
  4: { id: '5FRJFu_qSA4', title: 'Module 4 - Smart Contracts & Ethereum - Video Overview', duration: 406 },
  5: { id: '-yf3zg36N8M', title: 'Vibe Coding Blockchain | Module 5 - DeFi & NFTs | Explainer Video', duration: 411 },
  6: { id: '9r4eGG6rzPU', title: 'Module 6: Enterprise Blockchain & Real-World Use Cases | Explainer Video', duration: 452 },
  7: { id: 'J4lw7bN8isw', title: 'Module 7: Regulation, CBDCs, and the Future of Blockchain | Explainer Video', duration: 438 },
};

// Content repo commit SHA for pinned download URLs
const CONTENT_REPO = 'SM-Web-Systems/blockchain-foundations-for-vibe-coding';
const CONTENT_SHA = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';

const MODULE_DIRS = {
  1: 'module-1-intro',
  2: 'module-2-technical',
  3: 'module-3-bitcoin',
  4: 'module-4-smart-contracts',
  5: 'module-5-defi-nfts',
  6: 'module-6-enterprise',
  7: 'module-7-future',
};

const LOCAL_CONTENT_BASE = 'https://blockchain-vibe-coding.smwebsystems.com';
const GITHUB_CONTENT_BASE = `https://github.com/${CONTENT_REPO}/blob/main`;
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${CONTENT_REPO}/${CONTENT_SHA}`;

// ── Main ─────────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

console.log(`\n=== BVC Course Upgrade v2 ===`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write to DB)'}`);
console.log(`Course: ${BVC_COURSE_ID}`);
console.log(`Content SHA: ${CONTENT_SHA}\n`);

// Step 1: Verify course exists and read current state
const course = db.prepare('SELECT id, title, sections FROM courses WHERE id = ?').get(BVC_COURSE_ID);
if (!course) {
  console.error('ERROR: Course not found!');
  process.exit(1);
}

const currentSections = JSON.parse(course.sections);
// Handle both formats
const isAlreadyWeeks = Array.isArray(currentSections) && currentSections.length > 0 && Array.isArray(currentSections[0]?.sections);
const flatSections = isAlreadyWeeks
  ? currentSections.flatMap(w => w.sections ?? [])
  : currentSections;

console.log(`Current format: ${isAlreadyWeeks ? 'weeks' : 'flat sections'}`);
console.log(`Current sections: ${flatSections.length}`);
console.log(`Current items: ${flatSections.reduce((n, s) => n + s.items.length, 0)}`);

// Step 2: Verify all expected section IDs exist
for (let n = 1; n <= 7; n++) {
  const sec = flatSections.find(s => s.id === `bvc-sec-${n}`);
  if (!sec) {
    console.error(`ERROR: Section bvc-sec-${n} not found!`);
    process.exit(1);
  }
}

// Step 3: Verify quiz records
const quizCount = db.prepare('SELECT COUNT(*) as cnt FROM quizzes WHERE course_id = ?').get(BVC_COURSE_ID);
console.log(`BVC quizzes: ${quizCount.cnt}`);

const finalQuiz = db.prepare('SELECT id, passing_score FROM quizzes WHERE id = ?').get('bvc-quiz-0000-0000-000000000001');
if (!finalQuiz) {
  console.error('ERROR: Final quiz not found!');
  process.exit(1);
}
console.log(`Final quiz: ${finalQuiz.id} (pass=${finalQuiz.passing_score}%) — PRESERVED`);

// Step 4: Verify existing progress
const lessonCompletions = db.prepare('SELECT COUNT(*) as cnt FROM lesson_completions WHERE course_id = ?').get(BVC_COURSE_ID);
const quizCompletions = db.prepare("SELECT COUNT(*) as cnt FROM quiz_completions qc JOIN quizzes q ON qc.quiz_id = q.id WHERE q.course_id = ?").get(BVC_COURSE_ID);
const nftCredentials = db.prepare('SELECT COUNT(*) as cnt FROM nft_credentials WHERE course_id = ?').get(BVC_COURSE_ID);

console.log(`Lesson completions: ${lessonCompletions.cnt}`);
console.log(`Quiz completions: ${quizCompletions.cnt}`);
console.log(`NFT credentials: ${nftCredentials.cnt}`);

// Step 5: Build updated sections with YouTube URLs
function buildUpdatedSection(n) {
  const sec = flatSections.find(s => s.id === `bvc-sec-${n}`);
  const dir = MODULE_DIRS[n];
  const yt = YOUTUBE_VIDEO_MAP[n];

  // Update video item to use YouTube embed URL
  const updatedItems = sec.items.map(item => {
    if (item.id === `bvc-${n}-video`) {
      return {
        ...item,
        // YouTube embed URL as primary video source
        url: `https://www.youtube.com/watch?v=${yt.id}`,
        description: `${item.description || ''}\n\nYouTube: ${yt.title}\nLocal fallback: ${LOCAL_CONTENT_BASE}/${dir}/content/explainer-video.mp4\nDownload: ${GITHUB_RAW_BASE}/${dir}/content/explainer-video.mp4`.trim(),
      };
    }
    return item;
  });

  return {
    ...sec,
    items: updatedItems,
  };
}

// Step 6: Build weeks structure
const week1Sections = [1, 2, 3, 4].map(n => buildUpdatedSection(n));
const week2Sections = [5, 6, 7].map(n => buildUpdatedSection(n));

const weeksData = [
  {
    id: 'bvc-week-1',
    title: 'Week 1',
    order: 1,
    sections: week1Sections,
  },
  {
    id: 'bvc-week-2',
    title: 'Week 2',
    order: 2,
    sections: week2Sections,
  },
];

// Step 7: Report planned changes
console.log('\n=== PLANNED CHANGES ===');
console.log(`Week 1: ${week1Sections.length} sections (Modules 1–4)`);
week1Sections.forEach(s => {
  console.log(`  ${s.id}: ${s.title} (${s.items.length} items)`);
});
console.log(`Week 2: ${week2Sections.length} sections (Modules 5–7)`);
week2Sections.forEach(s => {
  console.log(`  ${s.id}: ${s.title} (${s.items.length} items)`);
});

console.log('\nYouTube video mapping:');
for (let n = 1; n <= 7; n++) {
  const yt = YOUTUBE_VIDEO_MAP[n];
  console.log(`  Module ${n}: https://www.youtube.com/watch?v=${yt.id} (${yt.duration}s)`);
}

// Verify total item/section counts
const totalItems = weeksData.reduce((n, w) => n + w.sections.reduce((m, s) => m + s.items.length, 0), 0);
const totalSections = weeksData.reduce((n, w) => n + w.sections.length, 0);
console.log(`\nTotal: ${weeksData.length} weeks, ${totalSections} sections, ${totalItems} items`);

// Verify all existing item IDs are preserved
const existingItemIds = new Set(flatSections.flatMap(s => s.items.map(i => i.id)));
const newItemIds = new Set(weeksData.flatMap(w => w.sections.flatMap(s => s.items.map(i => i.id))));
const missingIds = [...existingItemIds].filter(id => !newItemIds.has(id));
if (missingIds.length > 0) {
  console.error(`ERROR: Missing item IDs: ${missingIds.join(', ')}`);
  process.exit(1);
}
console.log(`All ${existingItemIds.size} existing item IDs preserved.`);

// Verify all existing section IDs are preserved
const existingSectionIds = new Set(flatSections.map(s => s.id));
const newSectionIds = new Set(weeksData.flatMap(w => w.sections.map(s => s.id)));
const missingSectionIds = [...existingSectionIds].filter(id => !newSectionIds.has(id));
if (missingSectionIds.length > 0) {
  console.error(`ERROR: Missing section IDs: ${missingSectionIds.join(', ')}`);
  process.exit(1);
}
console.log(`All ${existingSectionIds.size} existing section IDs preserved.`);

// Step 8: Apply or skip
if (DRY_RUN) {
  console.log('\n=== DRY RUN — no changes written ===');
  console.log('To apply: docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-course-v2.js');
} else {
  console.log('\n=== APPLYING CHANGES ===');

  const storedJson = JSON.stringify(weeksData);

  const upgrade = db.transaction(() => {
    // Backup: print current JSON for rollback
    console.log('\nBACKUP_JSON_START');
    console.log(course.sections);
    console.log('BACKUP_JSON_END\n');

    // Update course sections to weeks format
    db.prepare('UPDATE courses SET sections = ? WHERE id = ?').run(storedJson, BVC_COURSE_ID);
    console.log('Course sections updated to weeks format.');

    // Verify the stored data
    const updated = db.prepare('SELECT sections FROM courses WHERE id = ?').get(BVC_COURSE_ID);
    const parsedBack = JSON.parse(updated.sections);
    if (!Array.isArray(parsedBack) || parsedBack.length !== 2) {
      throw new Error('Verification failed: expected 2 weeks');
    }
    if (parsedBack[0].sections.length !== 4) {
      throw new Error('Verification failed: Week 1 should have 4 sections');
    }
    if (parsedBack[1].sections.length !== 3) {
      throw new Error('Verification failed: Week 2 should have 3 sections');
    }

    // Verify student data unchanged
    const lcAfter = db.prepare('SELECT COUNT(*) as cnt FROM lesson_completions WHERE course_id = ?').get(BVC_COURSE_ID);
    const qcAfter = db.prepare("SELECT COUNT(*) as cnt FROM quiz_completions qc JOIN quizzes q ON qc.quiz_id = q.id WHERE q.course_id = ?").get(BVC_COURSE_ID);
    const nftAfter = db.prepare('SELECT COUNT(*) as cnt FROM nft_credentials WHERE course_id = ?').get(BVC_COURSE_ID);

    if (lcAfter.cnt !== lessonCompletions.cnt) throw new Error(`Lesson completions changed: ${lessonCompletions.cnt} → ${lcAfter.cnt}`);
    if (qcAfter.cnt !== quizCompletions.cnt) throw new Error(`Quiz completions changed: ${quizCompletions.cnt} → ${qcAfter.cnt}`);
    if (nftAfter.cnt !== nftCredentials.cnt) throw new Error(`NFT credentials changed: ${nftCredentials.cnt} → ${nftAfter.cnt}`);

    console.log('Student data verification: PASS');
    console.log(`  Lesson completions: ${lcAfter.cnt} (unchanged)`);
    console.log(`  Quiz completions: ${qcAfter.cnt} (unchanged)`);
    console.log(`  NFT credentials: ${nftAfter.cnt} (unchanged)`);
  });

  upgrade();
  console.log('\n=== UPGRADE COMPLETE ===');
}

db.close();
