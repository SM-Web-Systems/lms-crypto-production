import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  integrationStatus,
  listCertificates,
  listIssuedCredentials,
  listDemoSponsorTransfers,
  remintCredential,
} from '../controllers/adminController.js';

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

// GET /admin/integration-status — admin only, read-only, rate-limited
router.get(
  '/integration-status',
  diagLimiter,
  authenticate,
  requirePermission('system.view_audit_log'),
  integrationStatus,
);

// GET /admin/certificates — all course NFT applications across all courses
router.get(
  '/certificates',
  diagLimiter,
  authenticate,
  requirePermission('certificate.approve'),
  listCertificates,
);

// GET /admin/issued-credentials — all nft_credentials rows (legacy + application-workflow)
// Admins see all; lecturers see only credentials for their assigned courses.
router.get(
  '/issued-credentials',
  diagLimiter,
  authenticate,
  requirePermission('certificate.approve'),
  listIssuedCredentials,
);

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

// POST /admin/credentials/:credentialId/remint — L-013 re-mint correction flow
// Admin-only. Marks old credential as superseded, mints new NFT to corrected wallet.
router.post(
  '/credentials/:credentialId/remint',
  authenticate,
  requirePermission('certificate.mint'),
  remintCredential,
);

export default router;
