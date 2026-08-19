import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import {
  integrationStatus,
  listCertificates,
  listIssuedCredentials,
  listDemoSponsorTransfers,
  remintCredential,
  handleReconcile,
} from '../controllers/adminController.js';
import { db } from '../config/database.js';
import { reconcileAccount } from '../services/rewards/rewardLedger.js';
import type { AccountType } from '../services/rewards/rewardTypes.js';

const router = Router();

/**
 * Tight rate limiter for admin diagnostics GET endpoints.
 * 20 requests per IP per 15 minutes — enough for any monitoring script,
 * blocks abuse without affecting legitimate admin use.
 * writeLimiter skips GETs, so we apply this dedicated limiter explicitly.
 */
const diagLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many diagnostics requests, please try again later' },
  },
});

/**
 * @openapi
 * /admin/integration-status:
 *   get:
 *     tags: [Admin]
 *     summary: AmmaWallet integration diagnostics
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Integration status data }
 *       403: { description: Requires system.view_audit_log }
 */
// GET /admin/integration-status — admin only, read-only, rate-limited
router.get(
  '/integration-status',
  diagLimiter,
  authenticate,
  requirePermission('system.view_audit_log'),
  integrationStatus,
);

/**
 * @openapi
 * /admin/certificates:
 *   get:
 *     tags: [Admin]
 *     summary: List all NFT certificate applications
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All applications across courses }
 *       403: { description: Requires certificate.approve }
 */
// GET /admin/certificates — all course NFT applications across all courses
router.get(
  '/certificates',
  diagLimiter,
  authenticate,
  requirePermission('certificate.approve'),
  listCertificates,
);

/**
 * @openapi
 * /admin/issued-credentials:
 *   get:
 *     tags: [Admin]
 *     summary: List all issued credentials
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All credential rows }
 *       403: { description: Requires certificate.approve }
 */
// GET /admin/issued-credentials — all nft_credentials rows (legacy + application-workflow)
// Admins see all; lecturers see only credentials for their assigned courses.
router.get(
  '/issued-credentials',
  diagLimiter,
  authenticate,
  requirePermission('certificate.approve'),
  listIssuedCredentials,
);

/**
 * @openapi
 * /admin/demo-sponsor-transfers:
 *   get:
 *     tags: [Admin]
 *     summary: List demo sponsor transfers (testnet only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Simulated transfer log }
 *       403: { description: Requires system.view_audit_log }
 */
// GET /admin/demo-sponsor-transfers — DEMO ONLY, clearly labeled in response
// Returns all rows from demo_sponsor_transfers with a prominent warning that
// these are simulated testnet transfers, NOT real sponsor grants.
router.get(
  '/demo-sponsor-transfers',
  diagLimiter,
  authenticate,
  requirePermission('system.view_audit_log'),
  listDemoSponsorTransfers,
);

/**
 * @openapi
 * /admin/credentials/{credentialId}/remint:
 *   post:
 *     tags: [Admin]
 *     summary: Re-mint NFT credential
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Credential re-minted }
 *       403: { description: Requires certificate.mint }
 */
// POST /admin/credentials/:credentialId/remint — L-013 re-mint correction flow
// Admin-only. Marks old credential as superseded, mints new NFT to corrected wallet.
router.post(
  '/credentials/:credentialId/remint',
  authenticate,
  requirePermission('certificate.mint'),
  remintCredential,
);

/**
 * @openapi
 * /admin/credentials/{id}/reconcile:
 *   post:
 *     tags: [Admin]
 *     summary: Reconcile failed credential against Horizon
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reconciliation result }
 *       403: { description: Requires certificate.approve }
 */
router.post(
  '/credentials/:id/reconcile',
  authenticate,
  requirePermission('certificate.approve'),
  handleReconcile,
);

// GET /admin/rewards/reconcile — safe summary reconciliation
router.get(
  '/rewards/reconcile',
  authenticate,
  requirePermission('reward.manage'),
  (req: AuthRequest, res: Response): void => {
    const accounts = db.prepare(
      `SELECT user_id, account_type FROM reward_accounts`
    ).all() as Array<{ user_id: string; account_type: AccountType }>;

    let mismatchCount = 0;
    for (const acct of accounts) {
      const result = reconcileAccount(acct.user_id, acct.account_type);
      if (!result.matches) {
        mismatchCount++;
      }
    }

    res.json({
      success: true,
      data: {
        totalAccounts: accounts.length,
        mismatches: mismatchCount,
        allMatch: mismatchCount === 0,
        checkedAt: new Date().toISOString(),
      },
    });
  },
);

export default router;
