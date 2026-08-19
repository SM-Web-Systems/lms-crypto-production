import { Response, NextFunction } from 'express';
import { db, query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { mintCredential } from '../services/mintService.js';
import { reconcileCredential } from '../services/reconciliationService.js';
import { getNftProvider } from '../services/nftProvider.js';
import { auditLog } from '../services/auditService.js';
import logger from '../utils/logger.js';

/** LMS-MINT-005: expire stale pending mints (>30 min) to 'failed'. */
function expireStalePendingMints(): void {
  execute(
    `UPDATE nft_credentials SET mint_status = 'failed', error = 'Mint timed out (>30 min)', updated_at = datetime('now')
     WHERE mint_status = 'pending' AND created_at < datetime('now', '-30 minutes')`,
  );
}

/**
 * GET /api/v1/admin/demo-sponsor-transfers
 *
 * ⚠️  DEMO / SIMULATED SPONSOR FLOW ONLY ⚠️
 * Returns all rows from demo_sponsor_transfers.
 * These are NOT real sponsor grants. Source is a testnet Friendbot-funded account.
 * Network is Stellar TESTNET — zero monetary value.
 */
export async function listDemoSponsorTransfers(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM demo_sponsor_transfers ORDER BY created_at DESC`,
      []
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      warning: [
        'DEMO / SIMULATED SPONSOR FLOW — NOT REAL GRANTS',
        'Source accounts are Stellar TESTNET (Friendbot-funded). Zero monetary value.',
        'These records do NOT count as real sponsor-funded grant delivery events.',
      ],
      data: { transfers: rows, count: rows.length },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/certificates
 *
 * Returns all course NFT applications across all courses for the admin dashboard.
 * Supports optional query filters: ?status=pending|approved|rejected|minted&courseId=<uuid>
 */
export async function listCertificates(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { status, courseId } = req.query as { status?: string; courseId?: string };

  try {
    expireStalePendingMints();

    // LMS-MINT-006: enforce max page size
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && ['pending', 'approved', 'rejected', 'minted'].includes(status)) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (courseId) {
      conditions.push('a.course_id = ?');
      params.push(courseId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = query<{
      id: string; user_id: string; course_id: string; wallet_address: string;
      status: string; applied_at: string; reviewed_at: string | null;
      reviewed_by: string | null; review_notes: string | null;
      lecturer_rec: string | null; tx_hash: string | null;
      user_name: string; user_email: string; course_title: string;
      payment_status: string | null; payment_id: string | null;
      price_cents: number | null;
    }>(
      `SELECT a.*,
              u.name AS user_name, u.email AS user_email,
              c.title AS course_title,
              p.status AS payment_status, p.id AS payment_id,
              cp.price_cents
       FROM course_nft_applications a
       INNER JOIN users u ON u.id = a.user_id
       INNER JOIN courses c ON c.id = a.course_id
       LEFT JOIN payments p ON p.application_id = a.id
       LEFT JOIN course_pricing cp ON cp.course_id = a.course_id AND cp.is_active = 1
       ${where}
       ORDER BY a.applied_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const certificates = rows.map((r) => ({
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
      paymentStatus: r.payment_status as 'pending' | 'confirmed' | 'waived' | null,
      paymentId: r.payment_id,
      priceCents: r.price_cents ?? 0,
    }));

    res.json({ success: true, data: { certificates, total: certificates.length } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/issued-credentials
 *
 * Returns ALL rows from nft_credentials — including legacy quiz-triggered mints
 * (application_id = NULL) and course-level application-workflow mints.
 *
 * Admins see all credentials across all courses.
 * Lecturers see only credentials where nc.course_id is in their assigned courses.
 *
 * Optional query filters: ?courseId=<uuid>&userId=<uuid>&mintStatus=pending|minted|failed
 */
export async function listIssuedCredentials(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { courseId, userId, mintStatus, network } = req.query as {
    courseId?: string;
    userId?: string;
    mintStatus?: string;
    network?: string;
  };
  const role = req.user?.role;
  const requestingUserId = req.user?.userId;

  try {
    expireStalePendingMints();

    // LMS-MINT-006: enforce max page size
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Lecturers: scope to courses they are assigned to
    if (role === 'lecturer') {
      const lecturerCourses = query<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE user_id = ?',
        [requestingUserId],
      );
      if (lecturerCourses.length === 0) {
        res.json({ success: true, data: { credentials: [], total: 0 } });
        return;
      }
      const cids = lecturerCourses.map((r) => r.course_id);
      conditions.push(`nc.course_id IN (${cids.map(() => '?').join(',')})`);
      params.push(...cids);
    }

    if (courseId) {
      conditions.push('nc.course_id = ?');
      params.push(courseId);
    }
    if (userId) {
      conditions.push('nc.user_id = ?');
      params.push(userId);
    }
    if (mintStatus && ['pending', 'minted', 'failed'].includes(mintStatus)) {
      conditions.push('nc.mint_status = ?');
      params.push(mintStatus);
    }
    if (network && ['public', 'testnet'].includes(network)) {
      conditions.push('nc.network = ?');
      params.push(network);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = query<{
      id: string; user_id: string; quiz_id: string | null;
      course_id: string | null; application_id: string | null;
      wallet_address: string; mint_status: string; tx_hash: string | null;
      contract_id: string | null; network: string | null; error: string | null;
      created_at: string; updated_at: string; is_superseded: number;
      user_name: string | null; user_email: string | null;
      course_title: string | null; quiz_title: string | null;
      app_status: string | null; app_applied_at: string | null;
      app_reviewed_by: string | null; app_reviewed_at: string | null;
    }>(
      `SELECT nc.*,
              u.name  AS user_name,  u.email AS user_email,
              c.title AS course_title,
              q.title AS quiz_title,
              a.status     AS app_status,
              a.applied_at AS app_applied_at,
              a.reviewed_by  AS app_reviewed_by,
              a.reviewed_at  AS app_reviewed_at
       FROM nft_credentials nc
       LEFT JOIN users  u ON u.id = nc.user_id
       LEFT JOIN courses c ON c.id = nc.course_id
       LEFT JOIN quizzes q ON q.id = nc.quiz_id
       LEFT JOIN course_nft_applications a ON a.id = nc.application_id
       ${where}
       ORDER BY nc.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const credentials = rows.map((r) => ({
      credentialId: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      courseId: r.course_id,
      courseName: r.course_title,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title,
      applicationId: r.application_id,
      walletAddress: r.wallet_address,
      mintStatus: r.mint_status,
      txHash: r.tx_hash,
      contractId: r.contract_id,
      network: r.network,
      mintedAt: r.mint_status === 'minted' ? r.updated_at : null,
      mintError: r.error,
      applicationStatus: r.app_status,
      appliedAt: r.app_applied_at,
      reviewedBy: r.app_reviewed_by,
      reviewedAt: r.app_reviewed_at,
      mintPath: r.application_id ? 'course_application' : ('quiz_trigger' as const),
      isSuperseded: r.is_superseded === 1,
    }));

    res.json({ success: true, data: { credentials, total: credentials.length } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/integration-status
 *
 * Read-only aggregate diagnostics for the LMS ↔ AmmaWallet integration.
 * Requires: authenticate + requirePermission('system.manage_roles').
 *
 * Response contains only:
 *   - db health (SELECT 1)
 *   - AmmaWallet config presence flags (booleans only — no secret values)
 *   - wallet_linking_status counts (aggregated — no emails, names, or wallet addresses)
 *   - recent provisioning summary (counts only, last 60 min)
 *
 * One audit log line per call: userId, IP, route, status.
 */
export async function integrationStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.userId ?? 'unknown';
  const ip = req.ip ?? 'unknown';

  try {
    // DB health
    let dbStatus: 'ok' | 'error' = 'ok';
    try { db.prepare('SELECT 1').get(); } catch { dbStatus = 'error'; }

    // AmmaWallet config flags
    const timeoutMs = Number(process.env.AMMA_WALLET_TIMEOUT_MS) || 15_000;
    const ammaWallet = {
      url: !!process.env.AMMA_WALLET_URL,
      apiKey: !!process.env.AMMA_WALLET_API_KEY,
      network: process.env.AMMA_WALLET_NETWORK ?? 'testnet',
      timeoutMs,
    };

    // wallet_linking_status counts
    const statusRows = query<{ wallet_linking_status: string; c: number }>(
      'SELECT wallet_linking_status, COUNT(*) as c FROM users GROUP BY wallet_linking_status',
    );
    const walletStatus: Record<string, number> = { linked: 0, none: 0, existing_account: 0, total: 0 };
    for (const row of statusRows) {
      walletStatus[row.wallet_linking_status] = row.c;
      walletStatus.total += row.c;
    }

    // Recent provisioning summary — last 60 minutes, based on created_at
    const recentRows = query<{ wallet_linking_status: string; c: number }>(
      `SELECT wallet_linking_status, COUNT(*) as c
       FROM users
       WHERE created_at >= datetime('now', '-60 minutes')
       GROUP BY wallet_linking_status`,
    );
    const recentCounts: Record<string, number> = {};
    for (const row of recentRows) {
      recentCounts[row.wallet_linking_status] = row.c;
    }
    const recentAttempted = Object.values(recentCounts).reduce((a, b) => a + b, 0);
    const recentProvisioning = {
      windowMinutes: 60,
      attempted: recentAttempted,
      linked: recentCounts['linked'] ?? 0,
      existingAccount: recentCounts['existing_account'] ?? 0,
      notLinked: recentCounts['none'] ?? 0,
    };

    const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded';

    // NFT provider info (no secrets)
    let nftProvider: { name: string; version: string; network: string; capabilities: string[] } | null = null;
    try {
      nftProvider = getNftProvider().getProviderInfo();
    } catch { /* provider not configured — leave null */ }

    logger.info({ module: 'adminDiag', userId, ip, route: 'GET /api/v1/admin/integration-status', status: overallStatus }, 'Integration status checked');

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      db: dbStatus,
      ammaWallet,
      nftProvider,
      walletStatus,
      recentProvisioning,
    });
  } catch (error) {
    logger.error({ module: 'adminDiag', userId, ip, err: error }, 'Integration status error');
    next(error);
  }
}


/**
 * POST /api/v1/admin/credentials/:credentialId/remint
 *
 * Re-mints an NFT credential to a (possibly corrected) wallet address.
 * The original credential is marked is_superseded=1 and remains in the DB for audit.
 * A new nft_credentials row is inserted for the new mint.
 *
 * Body (all optional):
 *   walletAddress — override destination wallet; defaults to original wallet
 *   notes         — admin note logged to the new credential's error field as metadata
 *
 * Requires: authenticate + requirePermission('certificate.mint')
 */
export async function remintCredential(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { credentialId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const walletOverride = body.walletAddress != null ? String(body.walletAddress).trim() : null;

    // Find existing credential
    const existing = queryOne<{
      id: string; user_id: string; course_id: string | null;
      application_id: string | null; wallet_address: string;
      mint_status: string; is_superseded: number; contract_id: string | null;
      network: string | null;
    }>(
      'SELECT id, user_id, course_id, application_id, wallet_address, mint_status, is_superseded, contract_id, network FROM nft_credentials WHERE id = ?',
      [credentialId],
    );
    if (!existing) {
      throw new AppError('Credential not found', 404, ErrorCodes.NOT_FOUND);
    }
    if (existing.mint_status !== 'minted') {
      throw new AppError(
        `Cannot re-mint a credential with status '${existing.mint_status}'. Only 'minted' credentials can be re-minted.`,
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (existing.is_superseded) {
      throw new AppError(
        'This credential has already been superseded by a re-mint. Find the latest active credential instead.',
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (!existing.course_id) {
      throw new AppError(
        'Re-mint is only supported for course-level credentials (course_id required).',
        422,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // LMS-AUTH-009: 1-hour cooldown between remints for same user+course
    const recentRemint = queryOne<{ id: string }>(
      `SELECT id FROM nft_credentials
       WHERE user_id = ? AND course_id = ? AND is_superseded = 0
         AND created_at > datetime('now', '-1 hour')
       LIMIT 1`,
      [existing.user_id, existing.course_id],
    );
    if (recentRemint && recentRemint.id !== credentialId) {
      throw new AppError(
        'A credential was recently minted for this user and course. Please wait before re-minting.',
        429,
        'REMINT_COOLDOWN',
      );
    }

    const targetWallet = walletOverride || existing.wallet_address;
    const contractId = process.env.NFT_CONTRACT_ID;
    if (!contractId) {
      throw new AppError('NFT contract not configured', 502, ErrorCodes.INTERNAL_ERROR);
    }

    // Call mint service (throws on failure)
    let txHash: string;
    let sorobanTokenId: string | null = null;
    try {
      const result = await mintCredential({
        userId: existing.user_id,
        courseId: existing.course_id,
        walletAddress: targetWallet,
        applicationId: existing.application_id ?? existing.id,
      });
      txHash = result.txHash;
      sorobanTokenId = result.sorobanTokenId != null ? String(result.sorobanTokenId) : null;
    } catch (mintErr: unknown) {
      const msg = mintErr instanceof Error ? mintErr.message : String(mintErr);
      let code = 'REMINT_FAILED';
      let status = 502;
      if (/insufficient|balance|fund/i.test(msg)) {
        code = 'INSUFFICIENT_FUNDS';
      } else if (/contract|invoke|wasm/i.test(msg)) {
        code = 'CONTRACT_ERROR';
      } else if (/timeout|ECONNREFUSED|fetch|network/i.test(msg)) {
        code = 'NETWORK_ERROR';
        status = 503;
      }
      logger.error({ module: 'remint', credentialId, code, error: msg }, 'Remint failed');
      res.status(status).json({
        success: false,
        error: { code, message: `Mint failed: ${code}`, credentialId },
      });
      return;
    }

    // LMS-MINT-002: wrap in transaction to prevent TOCTOU race
    const newCredId = uuidv4();
    const doRemint = db.transaction(() => {
      // Re-check superseded inside transaction (TOCTOU guard)
      const still = queryOne<{ is_superseded: number }>(
        'SELECT is_superseded FROM nft_credentials WHERE id = ?',
        [credentialId],
      );
      if (still?.is_superseded) {
        throw new AppError('Credential was superseded by a concurrent request', 409, 'CONFLICT');
      }

      execute(
        `INSERT INTO nft_credentials
           (id, user_id, quiz_id, wallet_address, mint_status, tx_hash, soroban_token_id, contract_id, network,
            course_id, application_id, is_superseded)
         VALUES (?, ?, NULL, ?, 'minted', ?, ?, ?, ?, ?, ?, 0)`,
        [
          newCredId,
          existing.user_id,
          targetWallet,
          txHash,
          sorobanTokenId,
          contractId,
          existing.network ?? 'public',
          existing.course_id,
          existing.application_id,
        ],
      );

      execute(
        `UPDATE nft_credentials SET is_superseded = 1, updated_at = datetime('now') WHERE id = ?`,
        [credentialId],
      );

      if (existing.application_id) {
        execute(
          `UPDATE course_nft_applications SET credential_id = ?, tx_hash = ? WHERE id = ?`,
          [newCredId, txHash, existing.application_id],
        );
      }
    });
    doRemint();

    // LMS-ADM-006: audit log for remint
    auditLog({
      action: 'REMINT_CREDENTIAL',
      actorId: req.user?.userId ?? 'unknown',
      targetId: credentialId,
      details: `newCredId=${newCredId} oldCredId=${credentialId} wallet=${targetWallet}`,
    });

    res.json({
      success: true,
      data: {
        newCredentialId: newCredId,
        supersededCredentialId: credentialId,
        txHash,
        walletAddress: targetWallet,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/credentials/:id/reconcile
 *
 * Check Horizon for a failed credential's tx_hash. If the transaction
 * actually succeeded on-chain, update the DB to 'minted'.
 */
export async function handleReconcile(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { id } = req.params;
  try {
    const result = await reconcileCredential(id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
