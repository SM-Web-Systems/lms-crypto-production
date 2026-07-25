/**
 * NFT application routes (course-level certificate workflow).
 * Mounted at /api/v1 (full paths include /courses/:courseId/completions/...).
 *
 * POST   /courses/:courseId/completions/apply
 * GET    /courses/:courseId/completions/applications
 * GET    /courses/:courseId/completions/applications/:appId
 * POST   /courses/:courseId/completions/applications/:appId/recommend
 * PATCH  /courses/:courseId/completions/applications/:appId/approve
 * PATCH  /courses/:courseId/completions/applications/:appId/reject
 * POST   /courses/:courseId/completions/applications/:appId/mint
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, authorize, requireCourseAccess } from '../middleware/auth.js';
import { queryOne, query, execute } from '../config/database.js';
import { mintCredential } from '../services/mintService.js';
import { getCourseProgress } from '../services/courseCompletionService.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

/**
 * DEMO ONLY — records a pending demo_sponsor_transfer row when an NFT is minted.
 * This is NOT a real sponsor transfer. Network: Stellar TESTNET. Zero monetary value.
 * An admin must run scripts/demo-sponsor-flow.cjs to execute the actual testnet TX.
 */
function logDemoSponsorTrigger(applicationId: string, userId: string, courseId: string, courseTitle: string): void {
  try {
    const userRow = queryOne<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId]);
    execute(
      `INSERT OR IGNORE INTO demo_sponsor_transfers
         (id, demo_label, trigger_event, trigger_user_id, trigger_course_id,
          trigger_user_email, trigger_course, source_wallet, dest_wallet, amount_xlm,
          stellar_network, status)
       VALUES (?, 'DEMO/SIMULATED-NOT-A-REAL-SPONSOR-GRANT',
               ?, ?, ?, ?, ?,
               'PENDING-DEMO-TREASURY-TESTNET', 'PENDING-DEMO-DEV-FUND-TESTNET',
               5.0, 'testnet', 'pending-admin-execution')`,
      [
        uuidv4(),
        'course_nft_application_minted:' + applicationId,
        userId, courseId, userRow?.email ?? '', courseTitle,
      ]
    );
    console.log(`[DEMO-SPONSOR-TRIGGER] Pending demo transfer logged for mint appId=${applicationId} — NOT a real grant`);
  } catch (err) {
    // Never block the mint response for a demo hook failure
    console.error('[DEMO-SPONSOR-TRIGGER] Failed to log pending demo transfer (non-fatal):', err);
  }
}

const router = Router();

// ─── POST /courses/:courseId/completions/apply ────────────────────────────────
router.post(
  '/courses/:courseId/completions/apply',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { courseId } = req.params;

    const course = queryOne<{ id: string; title: string }>(
      'SELECT id, title FROM courses WHERE id = ?',
      [courseId]
    );
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    // Enrollment check (admin/lecturer bypass)
    if (req.user!.role === 'student') {
      const enrolled = queryOne<{ user_id: string }>(
        `SELECT uc.user_id FROM user_course_codes uc
         INNER JOIN courses c ON c.course_code = uc.course_code
         WHERE uc.user_id = ? AND c.id = ?`,
        [userId, courseId]
      );
      if (!enrolled) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCodes.FORBIDDEN, message: 'Not enrolled in this course' },
        });
        return;
      }
    }

    // Requirements gate
    const progress = getCourseProgress(userId, courseId);
    if (!progress.meetsAllRequirements) {
      res.status(422).json({
        success: false,
        error: { code: ErrorCodes.REQUIREMENTS_NOT_MET, message: 'Course requirements not yet met' },
        data: { progress },
      });
      return;
    }

    // Wallet must be linked
    const userRow = queryOne<{ walletAddress: string | null; wallet_linking_status: string | null }>(
      'SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?',
      [userId]
    );
    if (!userRow?.walletAddress || userRow.wallet_linking_status !== 'linked') {
      res.status(422).json({
        success: false,
        error: { code: ErrorCodes.WALLET_NOT_LINKED, message: 'Wallet not linked. Link your wallet at ammawallet.com first.' },
      });
      return;
    }

    // No active (non-rejected) application for this user+course
    const existingApp = queryOne<{ id: string }>(
      "SELECT id FROM course_nft_applications WHERE user_id = ? AND course_id = ? AND status NOT IN ('rejected')",
      [userId, courseId]
    );
    if (existingApp) {
      res.status(409).json({
        success: false,
        error: { code: ErrorCodes.APPLICATION_EXISTS, message: 'An application for this course already exists' },
      });
      return;
    }

    const appId = uuidv4();
    execute(
      `INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
      [appId, userId, courseId, userRow.walletAddress]
    );

    const inserted = queryOne<{ applied_at: string }>(
      'SELECT applied_at FROM course_nft_applications WHERE id = ?',
      [appId]
    );
    res.status(201).json({
      success: true,
      data: {
        applicationId: appId,
        courseId,
        status: 'pending',
        walletAddress: userRow.walletAddress,
        appliedAt: inserted?.applied_at ?? new Date().toISOString(),
      },
    });
  }
);

// ─── GET /courses/:courseId/completions/applications ─────────────────────────
router.get(
  '/courses/:courseId/completions/applications',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { courseId } = req.params;
    const { status } = req.query as { status?: string };
    const userId = req.user!.userId;
    const role = req.user!.role;

    const course = queryOne<{ id: string }>('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Course not found' },
      });
      return;
    }

    const conditions: string[] = ['a.course_id = ?'];
    const params: unknown[] = [courseId];

    if (role === 'student') {
      conditions.push('a.user_id = ?');
      params.push(userId);
    } else if (role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [courseId, userId]
      );
      if (!assigned) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCodes.FORBIDDEN, message: 'Not assigned to this course' },
        });
        return;
      }
    }

    if (status && ['pending', 'approved', 'rejected', 'minted'].includes(status)) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    const rows = query<{
      id: string; user_id: string; course_id: string; wallet_address: string;
      status: string; applied_at: string; reviewed_at: string | null;
      reviewed_by: string | null; review_notes: string | null;
      lecturer_rec: string | null; tx_hash: string | null;
      user_name: string; user_email: string; course_title: string;
      mint_error: string | null;
    }>(
      `SELECT a.*,
              u.name AS user_name, u.email AS user_email,
              c.title AS course_title,
              nc.error AS mint_error
       FROM course_nft_applications a
       INNER JOIN users u ON u.id = a.user_id
       INNER JOIN courses c ON c.id = a.course_id
       LEFT JOIN nft_credentials nc ON nc.application_id = a.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.applied_at DESC`,
      params
    );

    res.json({
      success: true,
      data: {
        applications: rows.map((r) => ({
          applicationId: r.id,
          userId: r.user_id,
          userName: r.user_name,
          userEmail: r.user_email,
          courseId: r.course_id,
          courseName: r.course_title,
          walletAddress: r.wallet_address,
          status: r.status,
          appliedAt: r.applied_at,
          reviewedAt: r.reviewed_at,
          reviewedBy: r.reviewed_by,
          reviewNotes: r.review_notes,
          lecturerRecommendation: r.lecturer_rec,
          txHash: r.tx_hash,
          mintError: r.mint_error,
        })),
      },
    });
  }
);

// ─── GET /courses/:courseId/completions/applications/:appId ──────────────────
router.get(
  '/courses/:courseId/completions/applications/:appId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { courseId, appId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const row = queryOne<{
      id: string; user_id: string; course_id: string; wallet_address: string;
      status: string; applied_at: string; reviewed_at: string | null;
      reviewed_by: string | null; review_notes: string | null;
      lecturer_rec: string | null; tx_hash: string | null;
      user_name: string; user_email: string; course_title: string;
    }>(
      `SELECT a.*,
              u.name AS user_name, u.email AS user_email,
              c.title AS course_title
       FROM course_nft_applications a
       INNER JOIN users u ON u.id = a.user_id
       INNER JOIN courses c ON c.id = a.course_id
       WHERE a.id = ? AND a.course_id = ?`,
      [appId, courseId]
    );

    if (!row) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' },
      });
      return;
    }

    if (role === 'student' && row.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Access denied' },
      });
      return;
    }
    if (role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [courseId, userId]
      );
      if (!assigned) {
        res.status(403).json({
          success: false,
          error: { code: ErrorCodes.FORBIDDEN, message: 'Not assigned to this course' },
        });
        return;
      }
    }

    res.json({
      success: true,
      data: {
        applicationId: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        courseId: row.course_id,
        courseName: row.course_title,
        walletAddress: row.wallet_address,
        status: row.status,
        appliedAt: row.applied_at,
        reviewedAt: row.reviewed_at,
        reviewedBy: row.reviewed_by,
        reviewNotes: row.review_notes,
        lecturerRecommendation: row.lecturer_rec,
        txHash: row.tx_hash,
      },
    });
  }
);

// ─── POST /courses/:courseId/completions/applications/:appId/recommend ────────
// Admin or assigned lecturer can add a recommendation
router.post(
  '/courses/:courseId/completions/applications/:appId/recommend',
  authenticate,
  requireCourseAccess,
  (req: AuthRequest, res: Response): void => {
    const { courseId, appId } = req.params;
    const { recommendation, notes } = req.body as { recommendation: string; notes?: string };
    const userId = req.user!.userId;

    if (!['approved', 'not_ready'].includes(recommendation)) {
      res.status(400).json({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'recommendation must be "approved" or "not_ready"',
        },
      });
      return;
    }

    const app = queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM course_nft_applications WHERE id = ? AND course_id = ?',
      [appId, courseId]
    );
    if (!app) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' },
      });
      return;
    }
    if (app.status !== 'pending') {
      res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot recommend: status is ${app.status}` },
      });
      return;
    }

    execute(
      `UPDATE course_nft_applications
       SET lecturer_rec = ?, lecturer_rec_notes = ?, lecturer_rec_by = ?, lecturer_rec_at = datetime('now')
       WHERE id = ?`,
      [recommendation, notes ?? null, userId, appId]
    );

    res.json({
      success: true,
      data: { applicationId: appId, lecturerRecommendation: recommendation },
    });
  }
);

// ─── PATCH /courses/:courseId/completions/applications/:appId/approve ─────────
router.patch(
  '/courses/:courseId/completions/applications/:appId/approve',
  authenticate,
  authorize('admin'),
  (req: AuthRequest, res: Response): void => {
    const { courseId, appId } = req.params;
    const { notes } = req.body as { notes?: string };
    const userId = req.user!.userId;

    const app = queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM course_nft_applications WHERE id = ? AND course_id = ?',
      [appId, courseId]
    );
    if (!app) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' },
      });
      return;
    }
    if (app.status !== 'pending') {
      res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot approve: status is ${app.status}` },
      });
      return;
    }

    execute(
      `UPDATE course_nft_applications
       SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?
       WHERE id = ?`,
      [userId, notes ?? null, appId]
    );

    res.json({ success: true, data: { applicationId: appId, status: 'approved' } });
  }
);

// ─── PATCH /courses/:courseId/completions/applications/:appId/reject ──────────
router.patch(
  '/courses/:courseId/completions/applications/:appId/reject',
  authenticate,
  authorize('admin'),
  (req: AuthRequest, res: Response): void => {
    const { courseId, appId } = req.params;
    const { notes } = req.body as { notes?: string };
    const userId = req.user!.userId;

    const app = queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM course_nft_applications WHERE id = ? AND course_id = ?',
      [appId, courseId]
    );
    if (!app) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' },
      });
      return;
    }
    if (app.status !== 'pending') {
      res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot reject: status is ${app.status}` },
      });
      return;
    }

    execute(
      `UPDATE course_nft_applications
       SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?
       WHERE id = ?`,
      [userId, notes ?? null, appId]
    );

    res.json({
      success: true,
      data: { applicationId: appId, status: 'rejected', notes: notes ?? null },
    });
  }
);

// ─── POST /courses/:courseId/completions/applications/:appId/mint ─────────────
router.post(
  '/courses/:courseId/completions/applications/:appId/mint',
  authenticate,
  authorize('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { courseId, appId } = req.params;

    const app = queryOne<{
      id: string; status: string; user_id: string; wallet_address: string;
    }>(
      'SELECT id, status, user_id, wallet_address FROM course_nft_applications WHERE id = ? AND course_id = ?',
      [appId, courseId]
    );
    if (!app) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Application not found' },
      });
      return;
    }
    if (app.status !== 'approved') {
      res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot mint: application status is ${app.status}` },
      });
      return;
    }

    // Re-verify wallet at mint time
    const userRow = queryOne<{ walletAddress: string | null; wallet_linking_status: string | null }>(
      'SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?',
      [app.user_id]
    );
    if (!userRow?.walletAddress || userRow.wallet_linking_status !== 'linked') {
      res.status(422).json({
        success: false,
        error: { code: ErrorCodes.WALLET_NOT_LINKED, message: 'User wallet is no longer linked' },
      });
      return;
    }

    // Idempotency: no already-minted credential for (user, course)
    const existingCred = queryOne<{ id: string }>(
      "SELECT id FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = 'minted'",
      [app.user_id, courseId]
    );
    if (existingCred) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_MINTED', message: 'NFT already minted for this user and course' },
      });
      return;
    }

    const contractId = process.env.NFT_CONTRACT_ID;
    if (!contractId) {
      res.status(502).json({
        success: false,
        error: { code: 'MINT_FAILED', message: 'NFT contract not configured', applicationId: appId },
      });
      return;
    }

    // Synchronous mint — throws on any failure
    let txHash: string;
    let sorobanTokenId: number | null = null;
    try {
      const result = await mintCredential({
        userId: app.user_id,
        courseId,
        walletAddress: userRow.walletAddress,
        applicationId: appId,
      });
      txHash = result.txHash;
      sorobanTokenId = result.sorobanTokenId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Persist a failed credential row so students and admins can see the error state.
      // UPDATE if a failed row already exists (retry scenario), INSERT otherwise.
      const existingFailedCred = queryOne<{ id: string }>(
        "SELECT id FROM nft_credentials WHERE course_id = ? AND application_id = ?",
        [courseId, appId]
      );
      if (existingFailedCred) {
        execute(
          `UPDATE nft_credentials SET mint_status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`,
          [msg, existingFailedCred.id]
        );
      } else {
        execute(
          `INSERT INTO nft_credentials
             (id, user_id, quiz_id, wallet_address, mint_status, error, contract_id, network, course_id, application_id)
           VALUES (?, ?, NULL, ?, 'failed', ?, ?, 'public', ?, ?)`,
          [uuidv4(), app.user_id, userRow.walletAddress, msg, contractId, courseId, appId]
        );
      }
      res.status(502).json({
        success: false,
        error: { code: 'MINT_FAILED', message: `Soroban transaction failed: ${msg}`, applicationId: appId },
      });
      return;
    }

    // Persist mint result
    const credId = uuidv4();
    execute(
      `INSERT INTO nft_credentials
         (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, soroban_token_id, contract_id, network, course_id, application_id)
       VALUES (?, ?, NULL, ?, 'minted', ?, ?, ?, 'public', ?, ?)`,
      [credId, app.user_id, userRow.walletAddress, txHash, sorobanTokenId, contractId, courseId, appId]
    );

    execute(
      `UPDATE course_nft_applications
       SET status = 'minted', tx_hash = ?, credential_id = ?, reviewed_at = datetime('now')
       WHERE id = ?`,
      [txHash, credId, appId]
    );

    const courseRow = queryOne<{ title: string }>('SELECT title FROM courses WHERE id = ?', [courseId]);

    // DEMO: fire-and-forget DB hook — logs a pending demo sponsor transfer row.
    // NOT a real sponsor grant. An admin must run demo-sponsor-flow.cjs to execute the testnet TX.
    logDemoSponsorTrigger(appId, app.user_id, courseId, courseRow?.title ?? courseId);

    res.json({
      success: true,
      data: {
        applicationId: appId,
        status: 'minted',
        txHash,
        walletAddress: userRow.walletAddress,
        courseId,
        courseName: courseRow?.title ?? '',
      },
    });
  }
);

export default router;
