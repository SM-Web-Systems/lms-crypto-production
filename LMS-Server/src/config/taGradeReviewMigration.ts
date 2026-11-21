import type { Database } from 'better-sqlite3';

/**
 * UX-002, additive only: a TA's proposal and feedback, and the lecturer's
 * send-back note, each get their own column so none overwrites another or the
 * learner-facing `feedback`. Safe to run on every startup.
 */
export function ensureTaGradeReviewColumns(db: Database): void {
  const columns = (db.pragma('table_info(submissions)') as Array<{ name: string }>).map(c => c.name);
  if (!columns.length) return;
  if (!columns.includes('proposed_status')) {
    db.exec("ALTER TABLE submissions ADD COLUMN proposed_status TEXT CHECK (proposed_status IN ('approved', 'rejected'))");
  }
  if (!columns.includes('review_note')) db.exec('ALTER TABLE submissions ADD COLUMN review_note TEXT');
  if (!columns.includes('ta_feedback')) {
    db.exec('ALTER TABLE submissions ADD COLUMN ta_feedback TEXT');
    // Before this column a TA grade wrote into `feedback`, which learners can read.
    // Move only proposals still waiting, once (this branch runs only on the upgrade).
    db.exec("UPDATE submissions SET ta_feedback = feedback, feedback = NULL WHERE grade_status = 'pending_approval' AND feedback IS NOT NULL");
  }
}
