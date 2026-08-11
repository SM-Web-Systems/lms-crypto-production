/**
 * Credentials endpoints.
 *
 * GET /api/v1/credentials/public?wallet=<address>  — no auth, used by AmmaWallet NFT page
 * GET /api/v1/credentials/mine                     — auth required, returns caller's credentials
 * GET /api/v1/credentials/verify/:credentialId     — no auth, public certificate verification
 * GET /api/v1/credentials/:credentialId/pdf        — no auth, certificate PDF download
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { query, queryOne } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { hasPermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { generateCertificatePdf } from '../services/certificatePdfService.js';
import { streamCertificateZip } from '../services/bulkExportService.js';

const router = Router();

/**
 * @openapi
 * /credentials/public:
 *   get:
 *     tags: [Certificates]
 *     summary: Get public credentials by wallet address
 *     parameters:
 *       - in: query
 *         name: wallet
 *         required: true
 *         schema:
 *           type: string
 *         description: Stellar wallet address to look up credentials for
 *     responses:
 *       '200':
 *         description: List of minted credentials for the given wallet address
 *       '400':
 *         description: wallet query param is required
 */
router.get('/credentials/public', (req: Request, res: Response): void => {
  const wallet = (req.query.wallet as string | undefined)?.trim();
  if (!wallet) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'wallet query param required' } });
    return;
  }

  const rows = query<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    course_id: string | null;
    course_title: string | null;
    course_code: string | null;
    quiz_id: string | null;
    quiz_title: string | null;
    network: string | null;
    created_at: string;
    soroban_token_id: number | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash,
            nc.course_id, c.title AS course_title, c.course_code,
            nc.quiz_id, q.title AS quiz_title,
            nc.network, nc.created_at, nc.soroban_token_id
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN quizzes q ON q.id = nc.quiz_id
     WHERE nc.wallet_address = ? AND nc.mint_status = 'minted'
     ORDER BY nc.created_at DESC`,
    [wallet]
  );

  res.json({
    success: true,
    data: {
      credentials: rows.map((r) => ({
        credentialId: r.id,
        walletAddress: r.wallet_address,
        txHash: r.tx_hash,
        courseId: r.course_id,
        courseTitle: r.course_title,
        courseCode: r.course_code,
        quizId: r.quiz_id,
        quizTitle: r.quiz_title,
        network: r.network,
        mintedAt: r.created_at,
        sorobanTokenId: r.soroban_token_id ?? null,
      })),
    },
  });
});

// ─── GET /credentials/mine (auth-gated) ─────────────────────────────────────
/**
 * @openapi
 * /credentials/mine:
 *   get:
 *     tags: [Certificates]
 *     summary: Get own minted credentials
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of minted credentials belonging to the authenticated user
 *       '401':
 *         description: Unauthorized
 */
router.get('/credentials/mine', authenticate, (req: AuthRequest, res: Response): void => {
  const userId = req.user!.userId;

  const rows = query<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    course_id: string | null;
    course_title: string | null;
    course_code: string | null;
    quiz_id: string | null;
    quiz_title: string | null;
    network: string | null;
    created_at: string;
    soroban_token_id: number | null;
    contract_id: string | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash,
            nc.course_id, c.title AS course_title, c.course_code,
            nc.quiz_id, q.title AS quiz_title,
            nc.network, nc.created_at,
            nc.soroban_token_id, nc.contract_id
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN quizzes q ON q.id = nc.quiz_id
     WHERE nc.user_id = ? AND nc.mint_status = 'minted'
     ORDER BY nc.created_at DESC`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      credentials: rows.map((r) => ({
        credentialId: r.id,
        walletAddress: r.wallet_address,
        txHash: r.tx_hash,
        courseId: r.course_id,
        courseTitle: r.course_title,
        courseCode: r.course_code,
        quizId: r.quiz_id,
        quizTitle: r.quiz_title,
        network: r.network,
        issuedAt: r.created_at,
        sorobanTokenId: r.soroban_token_id ?? null,
        contractId: r.contract_id ?? '',
      })),
    },
  });
});

// ─── GET /credentials/verify/:credentialId (public) ─────────────────────────
/**
 * @openapi
 * /credentials/verify/{credentialId}:
 *   get:
 *     tags: [Certificates]
 *     summary: Verify an NFT certificate (public)
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: The credential UUID to verify
 *     responses:
 *       '200':
 *         description: Verified credential with full metadata
 *       '404':
 *         description: Certificate not found or not yet issued
 */
router.get('/credentials/verify/:credentialId', (req: Request, res: Response): void => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string;
    network: string;
    created_at: string;
    soroban_token_id: number | null;
    course_title: string | null;
    course_code: string | null;
    student_name: string | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash, nc.contract_id,
            nc.network, nc.created_at, nc.soroban_token_id,
            c.title AS course_title, c.course_code,
            u.name AS student_name
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Certificate not found or not yet issued' },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      credential: {
        credentialId: row.id,
        studentName: row.student_name ?? 'Student',
        courseTitle: row.course_title ?? 'Course',
        courseCode: row.course_code ?? '',
        walletAddress: row.wallet_address,
        txHash: row.tx_hash,
        contractId: row.contract_id,
        network: row.network,
        sorobanTokenId: row.soroban_token_id,
        issuedAt: row.created_at,
        issuer: 'SM Web Systems Blockchain Academy',
      },
    },
  });
});

// ─── GET /credentials/:credentialId/pdf (public) ────────────────────────────
/**
 * @openapi
 * /credentials/{credentialId}/pdf:
 *   get:
 *     tags: [Certificates]
 *     summary: Download certificate as PDF (public)
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: The credential UUID
 *     responses:
 *       '200':
 *         description: PDF certificate file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       '404':
 *         description: Certificate not found
 */
router.get('/credentials/:credentialId/pdf', async (req: Request, res: Response): Promise<void> => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string;
    network: string;
    created_at: string;
    soroban_token_id: number | null;
    course_title: string | null;
    course_code: string | null;
    student_name: string | null;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash, nc.contract_id,
            nc.network, nc.created_at, nc.soroban_token_id,
            c.title AS course_title, c.course_code,
            u.name AS student_name
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Certificate not found' },
    });
    return;
  }

  try {
    const pdfBuffer = await generateCertificatePdf({
      credentialId: row.id,
      studentName: row.student_name ?? 'Student',
      courseTitle: row.course_title ?? 'Course',
      courseCode: row.course_code ?? '',
      walletAddress: row.wallet_address,
      txHash: row.tx_hash,
      contractId: row.contract_id,
      network: row.network,
      sorobanTokenId: row.soroban_token_id,
      issuedAt: row.created_at,
    });

    const shortId = credentialId.slice(0, 8);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${shortId}.pdf"`);
    res.send(pdfBuffer);
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Failed to generate PDF' },
    });
  }
});

// ─── POST /credentials/bulk-export (auth-gated, rate-limited) ────────────────
const bulkExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : (process.env.NODE_ENV === 'development' ? 50 : 5),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many bulk export requests. Try again later.' } },
});

/**
 * @openapi
 * /credentials/bulk-export:
 *   post:
 *     tags: [Certificates]
 *     summary: Bulk export certificates as ZIP
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               credentialIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               cohortId:
 *                 type: string
 *     responses:
 *       '200':
 *         description: ZIP file containing certificate PDFs
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Validation error (too many IDs or missing params)
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: No certificates found
 */
router.post('/credentials/bulk-export', bulkExportLimiter, authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { credentialIds, cohortId } = req.body as { credentialIds?: string[]; cohortId?: string };

  if (!credentialIds?.length && !cohortId) {
    res.status(400).json({ success: false, error: { message: 'credentialIds or cohortId required' } });
    return;
  }

  // Validate credentialIds elements are non-empty strings
  if (credentialIds && !credentialIds.every((id) => typeof id === 'string' && id.length > 0)) {
    res.status(400).json({ success: false, error: { message: 'credentialIds must be an array of non-empty strings' } });
    return;
  }

  let ids: string[];

  if (cohortId) {
    // Admins (certificate.approve) or sponsors who own the cohort (cohort.manage) may export
    const isAdmin = hasPermission(userId, 'certificate.approve');
    const isCohortManager = hasPermission(userId, 'cohort.manage');
    if (!isAdmin && !isCohortManager) {
      res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } });
      return;
    }
    const cohort = queryOne<{ id: string; name: string; course_id: string; sponsor_user_id: string }>(
      'SELECT id, name, course_id, sponsor_user_id FROM sponsor_cohorts WHERE id = ?', [cohortId],
    );
    if (!cohort) {
      res.status(404).json({ success: false, error: { message: 'Cohort not found' } });
      return;
    }
    // Non-admin cohort managers (sponsors) can only export their own cohorts
    if (!isAdmin && cohort.sponsor_user_id !== userId) {
      res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } });
      return;
    }
    const rows = query<{ id: string }>(
      `SELECT nc.id FROM nft_credentials nc
       JOIN cohort_members cm ON cm.user_id = nc.user_id
       WHERE cm.cohort_id = ? AND nc.course_id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
      [cohortId, cohort.course_id],
    );
    ids = rows.map((r) => r.id);
  } else {
    ids = credentialIds!;
  }

  if (ids.length > 100) {
    res.status(400).json({ success: false, error: { message: 'Maximum 100 certificates per export' } });
    return;
  }

  if (ids.length === 0) {
    res.status(404).json({ success: false, error: { message: 'No certificates found to export' } });
    return;
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = query<{
    id: string; wallet_address: string; tx_hash: string | null; contract_id: string;
    network: string; created_at: string; soroban_token_id: number | null;
    course_title: string | null; course_code: string | null; student_name: string | null;
    user_id: string;
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash, nc.contract_id,
            nc.network, nc.created_at, nc.soroban_token_id,
            c.title AS course_title, c.course_code,
            u.name AS student_name, nc.user_id
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id IN (${placeholders}) AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    ids,
  );

  if (!cohortId) {
    const isAdmin = hasPermission(userId, 'certificate.approve');
    if (!isAdmin) {
      const unauthorized = rows.find((r) => r.user_id !== userId);
      if (unauthorized) {
        res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } });
        return;
      }
    }
  }

  if (rows.length === 0) {
    res.status(404).json({ success: false, error: { message: 'No certificates found to export' } });
    return;
  }

  const credentials = rows.map((r) => ({
    credentialId: r.id,
    studentName: r.student_name ?? 'Student',
    courseTitle: r.course_title ?? 'Course',
    courseCode: r.course_code ?? '',
    walletAddress: r.wallet_address,
    txHash: r.tx_hash,
    contractId: r.contract_id,
    network: r.network,
    sorobanTokenId: r.soroban_token_id,
    issuedAt: r.created_at,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const zipFilename = cohortId
    ? `cohort-certificates-${today}.zip`
    : `certificates-${today}.zip`;

  try {
    await streamCertificateZip(credentials, res, zipFilename);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { message: 'Failed to generate certificate archive' } });
    }
  }
});

export default router;
