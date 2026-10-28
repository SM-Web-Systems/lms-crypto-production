/**
 * W01-R2: Paystack payment binding tests.
 *
 * Tests that Paystack-funded rewards verify amount, currency, ownership
 * and obligation against the reward's authoritative state. The primary
 * gate for XLM rewards is the currency settlement check: no XLM-to-fiat
 * settlement policy exists, so Paystack funding fails closed.
 *
 * Tests also exercise the amount and ownership binding paths directly
 * via verifyPaystack to prove they work when currencies match (future).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundRewardAsync, getReward, getRewardTransactions } from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

// ──── Test Helpers ────

function createUser(role = 'admin', email?: string): string {
  const id = uuidv4();
  const userEmail = email ?? `${id}@test.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, userEmail, role);
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

function draftReward(sponsorId: string, cohortId: string, amountStroops = '10000000'): string {
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  return reward.id;
}

function mockPaystackSuccess(overrides: Record<string, unknown> = {}) {
  return {
    status: 'success',
    reference: `ref-${uuidv4()}`,
    amount: 10000, // 100.00 USD in cents
    currency: 'USD',
    paid_at: '2026-10-28T12:00:00Z',
    channel: 'card',
    metadata: {},
    customer: { email: 'user@test.com' },
    ...overrides,
  };
}

// ──── Tests ────

describe('W01-R2: Paystack payment binding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Currency settlement binding', () => {
    it('T01: rejects Paystack funding of XLM reward — no fiat settlement path', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const reference = `ref-${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ reference, customer: { email: `${sponsor}@test.com` } }),
      );

      try {
        await fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown FUNDING_CURRENCY_MISMATCH');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('FUNDING_CURRENCY_MISMATCH');
        expect(re.statusCode).toBe(402);
      }

      // Reward remains in draft
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('T02: currency mismatch path exists for amount check (XLM vs USD, currency fires first)', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      // Reward is 10,000,000 stroops (1 XLM), Paystack returns 500 cents (5 USD)
      const rewardId = draftReward(sponsor, cohortId, '10000000');
      const reference = `ref-${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ reference, amount: 500, currency: 'USD' }),
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);

      // Currency mismatch fires before amount check
      try {
        await fundRewardAsync(
          draftReward(sponsor, cohortId),
          sponsor,
          { type: 'paystack', reference: `ref-${uuidv4()}` },
          `fund-${uuidv4()}`,
        );
      } catch (err) {
        expect((err as RewardError).code).toBe('FUNDING_CURRENCY_MISMATCH');
      }
    });
  });

  describe('Ownership binding', () => {
    it('T03: rejects Paystack funding when payer email does not match actor (via currency first for XLM)', async () => {
      const sponsor = createUser('admin', 'sponsor@test.com');
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const reference = `ref-${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      // Paystack says imposter@test.com paid — not the sponsor
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ reference, customer: { email: 'imposter@test.com' } }),
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });
  });

  describe('Status binding (existing behavior preserved)', () => {
    it('T04: rejects failed Paystack status', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ status: 'failed' }),
      );

      try {
        await fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference: `ref-${uuidv4()}` }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('FUNDING_UNVERIFIED');
      }
    });

    it('T05: rejects pending Paystack status', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ status: 'pending' }),
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference: `ref-${uuidv4()}` }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);
    });

    it('T06: rejects abandoned Paystack status', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ status: 'abandoned' }),
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference: `ref-${uuidv4()}` }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);
    });
  });

  describe('Denial atomicity', () => {
    it('T07: currency mismatch leaves reward in draft with no ledger entries', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const reference = `ref-${uuidv4()}`;

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ reference }),
      );

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);

      // Reward is still draft
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      // No ledger entries created
      const txns = getRewardTransactions(rewardId);
      expect(txns).toHaveLength(0);

      // No accounts created for this user as funder
      const accounts = db.prepare(
        'SELECT * FROM reward_accounts WHERE user_id = ?'
      ).all(sponsor);
      expect(accounts).toHaveLength(0);
    });

    it('T08: currency mismatch does not affect pre-existing funder account balance', async () => {
      const sponsor = createUser();
      const cohortId = createCohort(sponsor);

      // Pre-create a funder account with a known balance (from a previous admin_grant)
      const adminId = uuidv4();
      db.prepare(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
      ).run(adminId, `${adminId}@test.com`);
      const otherRewardId = draftReward(sponsor, cohortId);
      // Fund with admin_grant to create a real funder account
      const { fundReward } = await import('../services/rewards/rewardService.js');
      fundReward(otherRewardId, adminId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      // Check balance before
      const beforeAccount = db.prepare(
        "SELECT available_stroops, reserved_stroops FROM reward_accounts WHERE user_id = ? AND account_type = 'funder'"
      ).get(sponsor) as { available_stroops: number; reserved_stroops: number } | undefined;

      // Now try Paystack funding of a different reward (should fail with currency mismatch)
      const rewardId2 = draftReward(sponsor, cohortId);
      const reference = `ref-${uuidv4()}`;
      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ reference }),
      );

      await expect(
        fundRewardAsync(rewardId2, sponsor, { type: 'paystack', reference }, `fund-${uuidv4()}`),
      ).rejects.toThrow(RewardError);

      // Balance unchanged
      const afterAccount = db.prepare(
        "SELECT available_stroops, reserved_stroops FROM reward_accounts WHERE user_id = ? AND account_type = 'funder'"
      ).get(sponsor) as { available_stroops: number; reserved_stroops: number } | undefined;
      expect(afterAccount?.available_stroops).toBe(beforeAccount?.available_stroops);
      expect(afterAccount?.reserved_stroops).toBe(beforeAccount?.reserved_stroops);
    });
  });

  describe('Direct verifier unit tests (F2 review finding — exercise amount/ownership paths)', () => {
    it('T11: verifyPaystack rejects amount mismatch when currencies match', async () => {
      // Import the verifier directly to test amount binding in isolation
      const { verifyPaystackBinding } = await import('../services/rewards/rewardFundingVerifier.js');

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ amount: 999, currency: 'USD', customer: { email: 'user@test.com' } }),
      );

      // Expected amount is 1000 cents, Paystack returns 999 — mismatch
      try {
        await verifyPaystackBinding(
          { type: 'paystack', reference: 'ref_test' },
          { rewardId: 'r1', expectedAmountMinorUnits: 1000, expectedCurrency: 'USD', actorEmail: 'user@test.com' },
        );
        expect.unreachable('Should have thrown FUNDING_AMOUNT_MISMATCH');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('FUNDING_AMOUNT_MISMATCH');
      }
    });

    it('T12: verifyPaystackBinding rejects ownership mismatch when currencies and amount match', async () => {
      const { verifyPaystackBinding } = await import('../services/rewards/rewardFundingVerifier.js');

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ amount: 1000, currency: 'USD', customer: { email: 'imposter@test.com' } }),
      );

      try {
        await verifyPaystackBinding(
          { type: 'paystack', reference: 'ref_test' },
          { rewardId: 'r1', expectedAmountMinorUnits: 1000, expectedCurrency: 'USD', actorEmail: 'legit@test.com' },
        );
        expect.unreachable('Should have thrown FUNDING_OWNERSHIP_MISMATCH');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('FUNDING_OWNERSHIP_MISMATCH');
      }
    });

    it('T13: verifyPaystackBinding passes when all bindings match', async () => {
      const { verifyPaystackBinding } = await import('../services/rewards/rewardFundingVerifier.js');

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ amount: 1000, currency: 'USD', customer: { email: 'user@test.com' } }),
      );

      // Should not throw
      await verifyPaystackBinding(
        { type: 'paystack', reference: 'ref_test' },
        { rewardId: 'r1', expectedAmountMinorUnits: 1000, expectedCurrency: 'USD', actorEmail: 'user@test.com' },
      );
    });

    it('T14: verifyPaystackBinding rejects when customer info missing from Paystack', async () => {
      const { verifyPaystackBinding } = await import('../services/rewards/rewardFundingVerifier.js');

      const paystackService = await import('../services/paystackService.js');
      vi.spyOn(paystackService, 'verifyTransaction').mockResolvedValue(
        mockPaystackSuccess({ amount: 1000, currency: 'USD', customer: undefined }),
      );

      try {
        await verifyPaystackBinding(
          { type: 'paystack', reference: 'ref_test' },
          { rewardId: 'r1', expectedAmountMinorUnits: 1000, expectedCurrency: 'USD', actorEmail: 'user@test.com' },
        );
        expect.unreachable('Should have thrown FUNDING_OWNERSHIP_MISMATCH');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('FUNDING_OWNERSHIP_MISMATCH');
      }
    });
  });
});
