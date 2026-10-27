/**
 * W01: Reward funding verification gate tests.
 *
 * Tests that fundReward() enforces funding evidence before transitioning
 * to 'funded' state. External source types (stellar, paystack) require
 * a verified reference. References cannot be reused across rewards.
 */
import { describe, it, expect, vi } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundReward, fundRewardAsync, getReward } from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

// ──── Test Helpers ────

function createUser(role = 'admin'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

/** Create an independent admin with reward.manage (via trg_auto_assign_user_role trigger). */
function createIndependentAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  return id;
}

function createCohort(sponsorId: string): string {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  const studentId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return cohortId;
}

function draftReward(sponsorId: string, cohortId: string): string {
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `idem-${uuidv4()}`,
  });
  return reward.id;
}

// ──── Tests ────

describe('W01: Funding verification gate', () => {
  describe('Stellar source type', () => {
    it('rejects funding with stellar type and no reference', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'stellar' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      // Reward remains in draft
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects funding with stellar type and empty reference', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'stellar', reference: '' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);
    });

    it('rejects stellar funding even with valid-looking reference (no Horizon client)', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'stellar', reference: 'tx_valid_hash' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });
  });

  describe('Paystack source type', () => {
    it('rejects funding with paystack type and no reference (async path)', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack' }, `fund-${uuidv4()}`)
      ).rejects.toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects funding with paystack type and invalid reference', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Mock verifyTransaction to reject
      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockRejectedValue(
        new Error('Paystack verification failed: Invalid reference')
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference: 'invalid_ref' }, `fund-${uuidv4()}`)
      ).rejects.toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      vi.restoreAllMocks();
    });

    it('accepts funding with paystack type and valid verified reference', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Mock verifyTransaction to succeed
      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference: 'valid_paystack_ref',
        amount: 10000000,
        currency: 'ZAR',
        paid_at: '2026-10-27T12:00:00Z',
        channel: 'card',
        metadata: {},
      });

      const funded = await fundRewardAsync(
        rewardId, sponsor, { type: 'paystack', reference: 'valid_paystack_ref' }, `fund-${uuidv4()}`
      );
      expect(funded.status).toBe('funded');

      vi.restoreAllMocks();
    });

    it('rejects paystack through sync fundReward path', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Sync fundReward must reject paystack (requires async verification)
      expect(() =>
        fundReward(rewardId, sponsor, { type: 'paystack', reference: 'ref_123' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);
    });
  });

  describe('Platform credit source type', () => {
    it('rejects platform_credit with INSUFFICIENT_CREDIT (W01-R1: fails closed)', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      try {
        fundReward(rewardId, admin, { type: 'platform_credit' }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('INSUFFICIENT_CREDIT');
        expect(re.statusCode).toBe(402);
      }

      // Reward remains in draft
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects platform_credit self-grant (W01-R1: conflict of interest)', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'platform_credit' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);
    });
  });

  describe('Admin grant source type', () => {
    it('allows admin_grant funding with independent admin (W01-R1)', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      const funded = fundReward(
        rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`
      );
      expect(funded.status).toBe('funded');
    });

    it('rejects admin_grant self-grant (W01-R1: conflict of interest)', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      try {
        fundReward(rewardId, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('CONFLICT_OF_INTEREST');
      }
    });
  });

  describe('Cross-reference idempotency', () => {
    it('rejects duplicate reference used for a different reward', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId1 = draftReward(sponsor, cohortId);
      const rewardId2 = draftReward(sponsor, cohortId);
      const reference = `paystack_ref_${uuidv4()}`;

      // Mock verifyTransaction to succeed
      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference,
        amount: 10000000,
        currency: 'ZAR',
        paid_at: '2026-10-27T12:00:00Z',
        channel: 'card',
        metadata: {},
      });

      // First reward funded successfully
      const funded1 = await fundRewardAsync(
        rewardId1, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`
      );
      expect(funded1.status).toBe('funded');

      // Second reward with same reference must fail
      await expect(
        fundRewardAsync(rewardId2, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`)
      ).rejects.toThrow(RewardError);

      // Second reward remains in draft
      const reward2 = getReward(rewardId2)!;
      expect(reward2.status).toBe('draft');

      vi.restoreAllMocks();
    });

    it('allows same reference for same reward (transaction idempotency)', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const reference = `paystack_ref_${uuidv4()}`;
      const fundKey = `fund-${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference,
        amount: 10000000,
        currency: 'ZAR',
        paid_at: '2026-10-27T12:00:00Z',
        channel: 'card',
        metadata: {},
      });

      const funded1 = await fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, fundKey);
      expect(funded1.status).toBe('funded');

      // Same idempotency key returns same result without re-verifying
      const funded2 = await fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, fundKey);
      expect(funded2.status).toBe('funded');
      expect(funded1.id).toBe(funded2.id);

      vi.restoreAllMocks();
    });
  });

  describe('Error codes and status codes', () => {
    it('returns FUNDING_UNVERIFIED with 402 for stellar without reference', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      try {
        fundReward(rewardId, sponsor, { type: 'stellar' }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('FUNDING_UNVERIFIED');
        expect(re.statusCode).toBe(402);
      }
    });

    it('returns DUPLICATE_REFERENCE with 409 for reused reference', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId1 = draftReward(sponsor, cohortId);
      const rewardId2 = draftReward(sponsor, cohortId);
      const reference = `paystack_ref_${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference,
        amount: 10000000,
        currency: 'ZAR',
        paid_at: '2026-10-27T12:00:00Z',
        channel: 'card',
        metadata: {},
      });

      await fundRewardAsync(rewardId1, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`);

      try {
        await fundRewardAsync(rewardId2, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('DUPLICATE_REFERENCE');
        expect(re.statusCode).toBe(409);
      }

      vi.restoreAllMocks();
    });
  });

  describe('Transaction atomicity', () => {
    it('does not create ledger entries when verification fails', () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'stellar', reference: 'tx_hash' }, `fund-${uuidv4()}`)
      ).toThrow();

      // No transactions created
      const txns = db.prepare(
        'SELECT * FROM reward_transactions WHERE reward_id = ?'
      ).all(rewardId);
      expect(txns).toHaveLength(0);

      // No account created
      const accounts = db.prepare(
        'SELECT * FROM reward_accounts WHERE user_id = ?'
      ).all(sponsor);
      expect(accounts).toHaveLength(0);
    });
  });
});
