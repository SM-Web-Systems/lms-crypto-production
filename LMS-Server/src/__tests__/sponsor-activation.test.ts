import { describe, it, expect, vi, afterEach } from 'vitest';
import './setup.js';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuid } from 'uuid';
import { db } from '../config/database.js';
import { queueSponsorOnboarding, SPONSOR_TASK_KEY } from '../services/sponsorActivationService.js';
import { transitionCohortStatus } from '../services/cohortService.js';

afterEach(() => vi.unstubAllEnvs());

function sponsor(opts: { amma?: boolean } = {}) {
  const id = uuid(), address = Keypair.random().publicKey();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, walletAddress) VALUES (?, 'Sponsor', ?, 'hash', 'lecturer', ?)").run(id, `${id}@test.invalid`, address);
  if (opts.amma) {
    db.prepare("INSERT INTO amma_wallet_links (user_id, amma_user_id, wallet_address, previous_address, imported_by, imported_at) VALUES (?, ?, ?, NULL, ?, datetime('now'))")
      .run(id, 500 + Math.floor(Math.random() * 1000), address, id);
  }
  return id;
}
function cohort(sponsorId: string) {
  const courseId = uuid(), id = uuid();
  db.prepare("INSERT INTO courses (id, title, course_code) VALUES (?, 'Course', ?)").run(courseId, courseId);
  db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name, status) VALUES (?, ?, ?, 'Cohort', 'draft')").run(id, sponsorId, courseId);
  return id;
}
const rows = (userId: string) => db.prepare('SELECT * FROM amma_activations WHERE user_id = ?').all(userId) as { task_key: string; completion_id: string; status: string; idempotency_key: string }[];

describe('sponsor wallet activation trigger', () => {
  it('does nothing unless AMMA_SPONSOR_ACTIVATION=on', () => {
    const s = sponsor({ amma: true }), c = cohort(s);
    expect(queueSponsorOnboarding(c)).toBe('off');
    expect(transitionCohortStatus(c, 'active', s)).toBe(true);
    expect(rows(s)).toHaveLength(0);
  });

  it('queues one activation with the sponsor task key when a cohort becomes active, once per sponsor', () => {
    vi.stubEnv('AMMA_SPONSOR_ACTIVATION', 'on');
    const s = sponsor({ amma: true }), c1 = cohort(s), c2 = cohort(s);
    expect(transitionCohortStatus(c1, 'active', s)).toBe(true);
    expect(rows(s)).toEqual([expect.objectContaining({ task_key: SPONSOR_TASK_KEY, completion_id: `sponsor-onboarded-${s}`, status: 'queued', idempotency_key: `lms-activate-sponsor-onboarded-${s}` })]);
    expect(transitionCohortStatus(c2, 'active', s)).toBe(true);
    expect(queueSponsorOnboarding(c2)).toBe('already_queued');
    expect(rows(s)).toHaveLength(1);
  });

  it('does not queue for a sponsor without a stored Amma-held wallet, or whose stored address changed, or for an unknown cohort', () => {
    vi.stubEnv('AMMA_SPONSOR_ACTIVATION', 'on');
    const plain = sponsor(), c = cohort(plain);
    expect(transitionCohortStatus(c, 'active', plain)).toBe(true);
    expect(rows(plain)).toHaveLength(0);
    expect(queueSponsorOnboarding(c)).toBe('no_amma_wallet');
    const moved = sponsor({ amma: true }), c2 = cohort(moved);
    db.prepare('UPDATE users SET walletAddress = ? WHERE id = ?').run(Keypair.random().publicKey(), moved);
    expect(queueSponsorOnboarding(c2)).toBe('no_amma_wallet');
    expect(queueSponsorOnboarding(uuid())).toBe('no_cohort');
  });

  it('does not queue when a cohort is completed rather than activated, and never breaks the cohort change', () => {
    vi.stubEnv('AMMA_SPONSOR_ACTIVATION', 'on');
    const s = sponsor({ amma: true }), c = cohort(s);
    db.prepare("UPDATE sponsor_cohorts SET status = 'active' WHERE id = ?").run(c);
    expect(transitionCohortStatus(c, 'completed', s)).toBe(true);
    expect(rows(s)).toHaveLength(0);
    db.exec('DROP TABLE amma_activations');
    const s2 = sponsor({ amma: true }), c2 = cohort(s2);
    expect(transitionCohortStatus(c2, 'active', s2)).toBe(true);
    expect(queueSponsorOnboarding(c2)).toBe('error');
  });
});
