/**
 * upgrade-bvc-audio-youtube.js — Add verified YouTube audio IDs to BVC course audio items
 *
 * Adds youtubeUrl field to each module's Audio Overview item.
 * Does NOT change native MP3 URLs, course structure, quizzes, or student data.
 *
 * Usage:
 *   DRY_RUN=1 node upgrade-bvc-audio-youtube.js   # Preview (default)
 *   DRY_RUN=0 node upgrade-bvc-audio-youtube.js   # Apply
 *
 * Docker:
 *   docker cp upgrade-bvc-audio-youtube.js lms-api:/app/
 *   docker exec -w /app lms-api node upgrade-bvc-audio-youtube.js
 *   docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-audio-youtube.js
 */

'use strict';

import Database from 'better-sqlite3';

const DB_PATH = '/app/data/student_ms.db';
const DRY_RUN = process.env.DRY_RUN !== '0';
const BVC_COURSE_ID = 'bvc-2026-0000-0000-000000000001';

// ── Verified YouTube audio mappings (duration-validated via yt-dlp + ffprobe) ──
// Each ID corresponds to the audio-overview track for that module in the playlist:
// https://www.youtube.com/playlist?list=PL6x19QC2pW48gwwO9EWX2TZUjrn2AaDSr

const AUDIO_YOUTUBE_MAP = {
  1: { id: 'RW1Q7lIExOM', localDur: 1388.2, ytDur: 1390, diff: 1.8 },
  2: { id: '912lvsqtntM', localDur: 1284.4, ytDur: 1285, diff: 0.6 },
  3: { id: 'yq-O8yV8d1A', localDur: 781.0, ytDur: 782, diff: 1.0 },
  4: { id: 'ilLsUuW2aeU', localDur: 819.8, ytDur: 820, diff: 0.2 },
  5: { id: 'uIr1AnwQY3Y', localDur: 1187.2, ytDur: 1188, diff: 0.8 },
  6: { id: 'HYzC_-3wSAI', localDur: 632.5, ytDur: 633, diff: 0.5 },  // YT title mislabeled as "Video"; description confirms "Audio Overview"
  7: { id: '1Ram_M_TZiU', localDur: 1318.6, ytDur: 1319, diff: 0.4 },
};

// YouTube ID validation (same pattern as frontend isValidYoutubeId)
const YT_ID_RE = /^[a-zA-Z0-9_-]{6,12}$/;

// ── Main ─────────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

console.log(`\n=== BVC Audio YouTube Upgrade ===`);
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

// Step 2: Verify baseline student data
const lessonCompletions = db.prepare('SELECT COUNT(*) as cnt FROM lesson_completions WHERE course_id = ?').get(BVC_COURSE_ID);
const quizCompletions = db.prepare("SELECT COUNT(*) as cnt FROM quiz_completions qc JOIN quizzes q ON qc.quiz_id = q.id WHERE q.course_id = ?").get(BVC_COURSE_ID);
const nftCredentials = db.prepare('SELECT COUNT(*) as cnt FROM nft_credentials WHERE course_id = ?').get(BVC_COURSE_ID);

console.log(`Lesson completions: ${lessonCompletions.cnt}`);
console.log(`Quiz completions: ${quizCompletions.cnt}`);
console.log(`NFT credentials: ${nftCredentials.cnt}`);

// Step 3: Add youtubeUrl to audio items
let updated = 0;
let skipped = 0;

for (const week of parsed) {
  for (const section of week.sections) {
    for (const item of section.items) {
      if (item.type !== 'audio') continue;

      // Match bvc-N-audio pattern
      const match = item.id.match(/^bvc-(\d+)-audio$/);
      if (!match) continue;

      const moduleNum = parseInt(match[1], 10);
      const mapping = AUDIO_YOUTUBE_MAP[moduleNum];
      if (!mapping) {
        console.log(`  SKIP ${item.id}: no mapping for module ${moduleNum}`);
        skipped++;
        continue;
      }

      // Validate YouTube ID
      if (!YT_ID_RE.test(mapping.id)) {
        console.error(`  ERROR: Invalid YouTube ID "${mapping.id}" for module ${moduleNum}`);
        process.exit(1);
      }

      if (item.youtubeUrl === mapping.id) {
        console.log(`  ALREADY SET ${item.id}: ${mapping.id}`);
        skipped++;
        continue;
      }

      console.log(`  SET ${item.id}: youtubeUrl = "${mapping.id}" (diff ${mapping.diff}s)`);
      item.youtubeUrl = mapping.id;
      updated++;
    }
  }
}

console.log(`\nUpdated: ${updated}, Skipped: ${skipped}`);

// Step 4: Verify structure unchanged
const allSections = parsed.flatMap(w => w.sections);
const allItems = allSections.flatMap(s => s.items);
console.log(`\nWeeks: ${parsed.length}, Sections: ${allSections.length}, Items: ${allItems.length}`);

// Verify week structure
if (parsed.length !== 2) { console.error('ERROR: Expected 2 weeks'); process.exit(1); }
if (parsed[0].sections.length !== 4) { console.error('ERROR: Week 1 should have 4 sections'); process.exit(1); }
if (parsed[1].sections.length !== 3) { console.error('ERROR: Week 2 should have 3 sections'); process.exit(1); }

// Verify audio items have both url and youtubeUrl
for (let n = 1; n <= 7; n++) {
  const audioItem = allItems.find(i => i.id === `bvc-${n}-audio`);
  if (!audioItem) { console.error(`ERROR: Audio item bvc-${n}-audio not found`); process.exit(1); }
  if (!audioItem.url?.includes('.mp3')) { console.error(`ERROR: Audio item bvc-${n}-audio missing MP3 URL`); process.exit(1); }
  if (!audioItem.youtubeUrl || !YT_ID_RE.test(audioItem.youtubeUrl)) { console.error(`ERROR: Audio item bvc-${n}-audio missing valid youtubeUrl`); process.exit(1); }
  console.log(`  bvc-${n}-audio: mp3=${audioItem.url.split('/').pop()} yt=${audioItem.youtubeUrl}`);
}

// Step 5: Apply or skip
if (DRY_RUN) {
  console.log('\n=== DRY RUN — no changes written ===');
  console.log('To apply: docker exec -w /app -e DRY_RUN=0 lms-api node upgrade-bvc-audio-youtube.js');
} else {
  if (updated === 0) {
    console.log('\n=== NO CHANGES NEEDED (all items already have youtubeUrl) ===');
  } else {
    console.log('\n=== APPLYING CHANGES ===');

    const storedJson = JSON.stringify(parsed);

    const upgrade = db.transaction(() => {
      db.prepare('UPDATE courses SET sections = ? WHERE id = ?').run(storedJson, BVC_COURSE_ID);
      console.log('Course sections updated with audio YouTube IDs.');

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
