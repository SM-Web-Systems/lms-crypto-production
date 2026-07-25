/**
 * Credentials endpoints.
 *
 * GET /api/v1/credentials/public?wallet=<address>  — no auth, used by AmmaWallet NFT page
 * GET /api/v1/credentials/mine                     — auth required, returns caller's credentials
 */

import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

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
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash,
            nc.course_id, c.title AS course_title, c.course_code,
            nc.quiz_id, q.title AS quiz_title,
            nc.network, nc.created_at
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
      })),
    },
  });
});

// ─── GET /credentials/mine (auth-gated) ─────────────────────────────────────
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
  }>(
    `SELECT nc.id, nc.wallet_address, nc.tx_hash,
            nc.course_id, c.title AS course_title, c.course_code,
            nc.quiz_id, q.title AS quiz_title,
            nc.network, nc.created_at
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
      })),
    },
  });
});

export default router;
