/**
 * upgrade-bvc-media-ux.js — Clean BVC media descriptions and add GitHub download URLs
 *
 * Changes:
 *   - Video items: clean description (remove fallback/download text), add downloadUrl (GitHub MP4)
 *   - Audio items: add downloadUrl (GitHub MP3)
 *   - Does NOT change item IDs, types, urls, youtubeUrl, or any other fields
 *   - Does NOT touch quizzes, completions, or credentials
 *
 * Usage:
 *   DRY_RUN=1 node upgrade-bvc-media-ux.js   # Preview (default)
 *   DRY_RUN=0 node upgrade-bvc-media-ux.js   # Apply
 *
 * Docker:
 *   docker cp upgrade-bvc-media-ux.js lms-api:/app/
 *   docker exec -w /app lms-api node upgrade-bvc-media-ux.js
 *   docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-media-ux.js
 */

'use strict';

import Database from 'better-sqlite3';

const DB_PATH = '/app/data/student_ms.db';
const DRY_RUN = process.env.DRY_RUN !== '0';
const BVC_COURSE_ID = 'bvc-2026-0000-0000-000000000001';

const PINNED_COMMIT = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const GH_REPO = 'SM-Web-Systems/blockchain-foundations-for-vibe-coding';
const GH_RAW_BASE = `https://raw.githubusercontent.com/${GH_REPO}/${PINNED_COMMIT}`;

// Module slug mapping
const MODULE_SLUGS = {
  1: 'module-1-intro',
  2: 'module-2-technical',
  3: 'module-3-bitcoin',
  4: 'module-4-smart-contracts',
  5: 'module-5-defi-nfts',
  6: 'module-6-enterprise',
  7: 'module-7-future',
};

// Clean video descriptions (first sentence only)
const VIDEO_DESCRIPTIONS = {
  1: 'Explainer video for Module 1.',
  2: 'Explainer video for Module 2.',
  3: 'Explainer video for Module 3.',
  4: 'Explainer video for Module 4.',
  5: 'Explainer video for Module 5.',
  6: 'Explainer video for Module 6.',
  7: 'Explainer video for Module 7.',
};

// YouTube ID validation
const YT_ID_RE = /^[a-zA-Z0-9_-]{6,12}$/;

// ── Main ─────────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

console.log(`\n=== BVC Media UX Upgrade ===`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will write to DB)'}`);
console.log(`Course: ${BVC_COURSE_ID}\n`);

// Step 1: Read current course
const course = db.prepare('SELECT id, title, sections FROM courses WHERE id = ?').get(BVC_COURSE_ID);
if (!course) {
  console.error('ERROR: Course not found!');
  process.exit(1);
}

const parsed = JSON.parse(course.sections);
if (!Array.isArray(parsed) || !parsed[0]?.sections) {
  console.error('ERROR: Expected weeks format');
  process.exit(1);
}

// Step 2: Capture baseline
const lessonCompletions = db.prepare('SELECT COUNT(*) as cnt FROM lesson_completions WHERE course_id = ?').get(BVC_COURSE_ID);
const quizCompletions = db.prepare("SELECT COUNT(*) as cnt FROM quiz_completions qc JOIN quizzes q ON qc.quiz_id = q.id WHERE q.course_id = ?").get(BVC_COURSE_ID);
const nftCredentials = db.prepare('SELECT COUNT(*) as cnt FROM nft_credentials WHERE course_id = ?').get(BVC_COURSE_ID);

console.log(`Baseline — LC: ${lessonCompletions.cnt}, QC: ${quizCompletions.cnt}, NFT: ${nftCredentials.cnt}`);

// Step 3: Update video and audio items
let updated = 0;
let skipped = 0;

for (const week of parsed) {
  for (const section of week.sections) {
    for (const item of section.items) {
      // ── Video items ──
      if (item.type === 'video') {
        const match = item.id.match(/^bvc-(\d+)-video$/);
        if (!match) continue;
        const n = parseInt(match[1], 10);
        const slug = MODULE_SLUGS[n];
        if (!slug) { skipped++; continue; }

        const newDesc = VIDEO_DESCRIPTIONS[n];
        const newDlUrl = `${GH_RAW_BASE}/${slug}/content/explainer-video.mp4`;

        const descChanged = item.description !== newDesc;
        const dlChanged = item.downloadUrl !== newDlUrl;

        if (!descChanged && !dlChanged) {
          console.log(`  ALREADY OK ${item.id}`);
          skipped++;
          continue;
        }

        console.log(`  UPDATE ${item.id}:`);
        if (descChanged) console.log(`    description: "${item.description?.substring(0, 60)}..." → "${newDesc}"`);
        if (dlChanged) console.log(`    downloadUrl: added`);

        item.description = newDesc;
        item.downloadUrl = newDlUrl;
        updated++;
      }

      // ── Audio items ──
      if (item.type === 'audio') {
        const match = item.id.match(/^bvc-(\d+)-audio$/);
        if (!match) continue;
        const n = parseInt(match[1], 10);
        const slug = MODULE_SLUGS[n];
        if (!slug) { skipped++; continue; }

        const newDlUrl = `${GH_RAW_BASE}/${slug}/content/audio-overview.mp3`;

        // Verify youtubeUrl is present and valid
        if (!item.youtubeUrl || !YT_ID_RE.test(item.youtubeUrl)) {
          console.error(`  ERROR: ${item.id} missing valid youtubeUrl`);
          process.exit(1);
        }

        if (item.downloadUrl === newDlUrl) {
          console.log(`  ALREADY OK ${item.id}`);
          skipped++;
          continue;
        }

        console.log(`  UPDATE ${item.id}: downloadUrl added`);
        item.downloadUrl = newDlUrl;
        updated++;
      }
    }
  }
}

console.log(`\nUpdated: ${updated}, Skipped: ${skipped}`);

// Step 4: Verify structure unchanged
const allSections = parsed.flatMap(w => w.sections);
const allItems = allSections.flatMap(s => s.items);
console.log(`\nStructure: ${parsed.length} weeks, ${allSections.length} sections, ${allItems.length} items`);

if (parsed.length !== 2) { console.error('ERROR: Expected 2 weeks'); process.exit(1); }
if (parsed[0].sections.length !== 4) { console.error('ERROR: Week 1 should have 4 sections'); process.exit(1); }
if (parsed[1].sections.length !== 3) { console.error('ERROR: Week 2 should have 3 sections'); process.exit(1); }

// Verify all video items have clean descriptions and download URLs
for (let n = 1; n <= 7; n++) {
  const videoItem = allItems.find(i => i.id === `bvc-${n}-video`);
  if (!videoItem) { console.error(`ERROR: bvc-${n}-video not found`); process.exit(1); }
  if (videoItem.description.includes('fallback') || videoItem.description.includes('blockchain-vibe-coding')) {
    console.error(`ERROR: bvc-${n}-video description still contains unwanted text`);
    process.exit(1);
  }
  if (!videoItem.downloadUrl?.includes('raw.githubusercontent.com')) {
    console.error(`ERROR: bvc-${n}-video missing downloadUrl`);
    process.exit(1);
  }
  console.log(`  bvc-${n}-video: desc="${videoItem.description}" dl=OK`);
}

// Verify all audio items have download URLs and youtubeUrl
for (let n = 1; n <= 7; n++) {
  const audioItem = allItems.find(i => i.id === `bvc-${n}-audio`);
  if (!audioItem) { console.error(`ERROR: bvc-${n}-audio not found`); process.exit(1); }
  if (!audioItem.youtubeUrl || !YT_ID_RE.test(audioItem.youtubeUrl)) {
    console.error(`ERROR: bvc-${n}-audio missing valid youtubeUrl`);
    process.exit(1);
  }
  if (!audioItem.downloadUrl?.includes('raw.githubusercontent.com')) {
    console.error(`ERROR: bvc-${n}-audio missing downloadUrl`);
    process.exit(1);
  }
  console.log(`  bvc-${n}-audio: yt=${audioItem.youtubeUrl} dl=OK`);
}

// Step 5: Apply or skip
if (DRY_RUN) {
  console.log('\n=== DRY RUN — no changes written ===');
  console.log('To apply: docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-media-ux.js');
} else {
  if (updated === 0) {
    console.log('\n=== NO CHANGES NEEDED (all items already updated) ===');
  } else {
    console.log('\n=== APPLYING CHANGES ===');

    const storedJson = JSON.stringify(parsed);

    const upgrade = db.transaction(() => {
      db.prepare('UPDATE courses SET sections = ? WHERE id = ?').run(storedJson, BVC_COURSE_ID);
      console.log('Course sections updated.');

      // Verify student data unchanged
      const lcAfter = db.prepare('SELECT COUNT(*) as cnt FROM lesson_completions WHERE course_id = ?').get(BVC_COURSE_ID);
      const qcAfter = db.prepare("SELECT COUNT(*) as cnt FROM quiz_completions qc JOIN quizzes q ON qc.quiz_id = q.id WHERE q.course_id = ?").get(BVC_COURSE_ID);
      const nftAfter = db.prepare('SELECT COUNT(*) as cnt FROM nft_credentials WHERE course_id = ?').get(BVC_COURSE_ID);

      if (lcAfter.cnt !== lessonCompletions.cnt) throw new Error(`Lesson completions changed: ${lessonCompletions.cnt} → ${lcAfter.cnt}`);
      if (qcAfter.cnt !== quizCompletions.cnt) throw new Error(`Quiz completions changed: ${quizCompletions.cnt} → ${qcAfter.cnt}`);
      if (nftAfter.cnt !== nftCredentials.cnt) throw new Error(`NFT credentials changed: ${nftCredentials.cnt} → ${nftAfter.cnt}`);

      console.log('Student data verification: PASS');
    });

    upgrade();
    console.log('\n=== UPGRADE COMPLETE ===');
  }
}

db.close();
