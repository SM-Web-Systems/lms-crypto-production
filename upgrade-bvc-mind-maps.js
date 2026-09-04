#!/usr/bin/env node
/**
 * BVC Mind Map Migration — Adds one Mind Map item to each of the seven
 * BVC module sections, placed after Flashcards and before Infographic.
 *
 * DEFAULT: DRY_RUN=1 (no writes). Set DRY_RUN=0 to apply.
 *
 * Usage:
 *   node upgrade-bvc-mind-maps.js              # dry run
 *   DRY_RUN=0 node upgrade-bvc-mind-maps.js    # live (requires explicit approval)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN !== '0';
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'LMS-Server/data/student_ms.db');

const COURSE_ID = 'bvc-2026-0000-0000-000000000001';
const EXPECTED_SECTIONS = 7;
const EXPECTED_ITEMS_PER_SECTION = 7;

const PINNED_COMMIT = 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472';
const REPO = 'SM-Web-Systems/blockchain-foundations-for-vibe-coding';

// Module slug mapping (matches actual repo directory names)
const MODULES = [
  { num: 1, slug: 'module-1-intro',            title: 'Introduction to Blockchain' },
  { num: 2, slug: 'module-2-technical',         title: 'Technical Foundations of Blockchain' },
  { num: 3, slug: 'module-3-bitcoin',           title: 'Bitcoin & Cryptocurrencies' },
  { num: 4, slug: 'module-4-smart-contracts',   title: 'Smart Contracts & Ethereum' },
  { num: 5, slug: 'module-5-defi-nfts',         title: 'DeFi & NFTs' },
  { num: 6, slug: 'module-6-enterprise',        title: 'Enterprise Blockchain & Real-World Use Cases' },
  { num: 7, slug: 'module-7-future',            title: 'Regulation, CBDCs, and the Future of Blockchain' },
];

function buildMindMapItem(mod) {
  return {
    id: `bvc-${mod.num}-mind-map`,
    type: 'link',
    title: `Mind Map: ${mod.title}`,
    order: 6, // after flashcards (5), before infographic (bumped to 7)
    url: `https://github.com/${REPO}/blob/main/${mod.slug}/content/mind-map.json`,
    description: `Interactive concept map for Module ${mod.num}.`,
  };
}

function main() {
  console.log(`\n=== BVC Mind Map Migration ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Course:   ${COURSE_ID}\n`);

  const db = new Database(DB_PATH, DRY_RUN ? { readonly: true } : undefined);

  try {
    // 1. Load course
    const row = db.prepare('SELECT sections FROM courses WHERE id = ?').get(COURSE_ID);
    if (!row) {
      console.error('ERROR: Course not found.');
      process.exit(1);
    }

    const weeks = JSON.parse(row.sections);
    if (!Array.isArray(weeks) || weeks.length !== 2) {
      console.error(`ERROR: Expected 2 weeks, found ${Array.isArray(weeks) ? weeks.length : typeof weeks}.`);
      process.exit(1);
    }

    // Collect all sections across weeks
    const allSections = [];
    for (const week of weeks) {
      if (!week.sections || !Array.isArray(week.sections)) {
        console.error(`ERROR: Week "${week.title}" has no sections array.`);
        process.exit(1);
      }
      allSections.push(...week.sections);
    }

    if (allSections.length !== EXPECTED_SECTIONS) {
      console.error(`ERROR: Expected ${EXPECTED_SECTIONS} sections, found ${allSections.length}.`);
      process.exit(1);
    }

    // 2. Validate expected section IDs
    for (let i = 0; i < EXPECTED_SECTIONS; i++) {
      const expectedId = `bvc-sec-${i + 1}`;
      if (allSections[i].id !== expectedId) {
        console.error(`ERROR: Section ${i + 1} has id "${allSections[i].id}", expected "${expectedId}".`);
        process.exit(1);
      }
    }

    // 3. Check each section and prepare insertions
    let totalInsertions = 0;
    let totalSkipped = 0;

    for (let i = 0; i < EXPECTED_SECTIONS; i++) {
      const section = allSections[i];
      const mod = MODULES[i];
      const mindMapId = `bvc-${mod.num}-mind-map`;

      // Check idempotency: already has mind map?
      const existingMindMap = section.items.find(item => item.id === mindMapId);
      if (existingMindMap) {
        console.log(`  [SKIP] ${section.title}: mind map "${mindMapId}" already exists.`);
        totalSkipped++;
        continue;
      }

      // Validate flashcards item exists at expected position
      const flashcardsIdx = section.items.findIndex(item => item.id === `bvc-${mod.num}-flashcards`);
      if (flashcardsIdx === -1) {
        console.error(`ERROR: Flashcards item "bvc-${mod.num}-flashcards" not found in "${section.title}".`);
        process.exit(1);
      }

      // Validate infographic item exists
      const infographicIdx = section.items.findIndex(item => item.id === `bvc-${mod.num}-infographic`);
      if (infographicIdx === -1) {
        console.error(`ERROR: Infographic item "bvc-${mod.num}-infographic" not found in "${section.title}".`);
        process.exit(1);
      }

      if (section.items.length !== EXPECTED_ITEMS_PER_SECTION) {
        console.error(`ERROR: Section "${section.title}" has ${section.items.length} items, expected ${EXPECTED_ITEMS_PER_SECTION}.`);
        process.exit(1);
      }

      // Build new mind map item
      const newItem = buildMindMapItem(mod);

      // Insert after flashcards (flashcardsIdx + 1)
      const insertIdx = flashcardsIdx + 1;
      section.items.splice(insertIdx, 0, newItem);

      // Re-number orders for items after insertion
      section.items.forEach((item, idx) => { item.order = idx + 1; });

      console.log(`  [ADD]  ${section.title}: "${newItem.title}" at position ${insertIdx + 1}/${section.items.length}`);
      console.log(`         ID: ${newItem.id}`);
      console.log(`         URL: ${newItem.url}`);
      totalInsertions++;
    }

    console.log(`\nSummary: ${totalInsertions} insertions, ${totalSkipped} skipped (already present).`);

    // 4. Validate final state
    const totalItems = allSections.reduce((sum, s) => sum + s.items.length, 0);
    const expectedTotal = EXPECTED_SECTIONS * EXPECTED_ITEMS_PER_SECTION + totalInsertions;
    console.log(`Total items: ${totalItems} (expected: ${expectedTotal})`);

    if (totalItems !== expectedTotal) {
      console.error('ERROR: Item count mismatch after insertion.');
      process.exit(1);
    }

    // 5. Write if live
    if (!DRY_RUN && totalInsertions > 0) {
      const updateStmt = db.prepare('UPDATE courses SET sections = ? WHERE id = ?');
      db.transaction(() => {
        updateStmt.run(JSON.stringify(weeks), COURSE_ID);
      })();
      console.log('\nDatabase updated successfully.');
    } else if (DRY_RUN) {
      console.log('\nDry run complete. No database changes made.');
      console.log('Run with DRY_RUN=0 to apply changes.');
    } else {
      console.log('\nNo changes needed.');
    }

  } finally {
    db.close();
  }
}

main();
