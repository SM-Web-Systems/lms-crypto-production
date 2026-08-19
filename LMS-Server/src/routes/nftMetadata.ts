/**
 * NFT Metadata endpoint — serves machine-readable JSON metadata for on-chain NFTs.
 *
 * GET /api/v1/nft/metadata/:tokenId
 *
 * Returns metadata in a format compatible with NFT explorers and wallets.
 * No auth required (public metadata, same policy as /credentials/verify).
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { queryOne } from '../config/database.js';

const router = Router();

const metadataLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const LMS_BASE_URL = process.env.LMS_BASE_URL || 'https://lms.smwebsystems.com';

router.get('/nft/metadata/:tokenId', metadataLimiter, (req: Request, res: Response): void => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (!Number.isFinite(tokenId) || tokenId < 0) {
    res.status(404).json({ error: 'Token not found' });
    return;
  }

  const row = queryOne<{
    id: string;
    soroban_token_id: number;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string | null;
    network: string | null;
    created_at: string;
    student_name: string | null;
    course_title: string | null;
    course_code: string | null;
    quiz_title: string | null;
  }>(
    `SELECT nc.id, nc.soroban_token_id, nc.wallet_address, nc.tx_hash,
            nc.contract_id, nc.network, nc.created_at,
            u.name AS student_name,
            c.title AS course_title, c.course_code,
            q.title AS quiz_title
     FROM nft_credentials nc
     LEFT JOIN users u ON u.id = nc.user_id
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN quizzes q ON q.id = nc.quiz_id
     WHERE nc.soroban_token_id = ?
       AND nc.mint_status = 'minted'
       AND nc.is_superseded = 0
     LIMIT 1`,
    [tokenId]
  );

  if (!row) {
    res.status(404).json({ error: 'Token not found' });
    return;
  }

  const courseName = row.course_title || row.quiz_title || 'Certificate';
  const studentName = row.student_name || 'Student';
  const issuedDate = row.created_at ? row.created_at.split('T')[0] : '';

  const attributes: Array<{ trait_type: string; value: string }> = [];
  if (row.course_title) attributes.push({ trait_type: 'Course', value: row.course_title });
  if (row.course_code) attributes.push({ trait_type: 'Course Code', value: row.course_code });
  if (row.quiz_title) attributes.push({ trait_type: 'Quiz', value: row.quiz_title });
  attributes.push({ trait_type: 'Student', value: studentName });
  if (issuedDate) attributes.push({ trait_type: 'Issued', value: issuedDate });
  if (row.network) attributes.push({ trait_type: 'Network', value: row.network });
  if (row.contract_id) attributes.push({ trait_type: 'Contract', value: row.contract_id });

  res.json({
    name: `SCC Certificate #${row.soroban_token_id}`,
    description: `Blockchain Academy course completion certificate for ${studentName} — ${courseName}`,
    image: `${LMS_BASE_URL}/api/v1/credentials/${row.id}/pdf`,
    external_url: `${LMS_BASE_URL}/verify/${row.id}`,
    attributes,
  });
});

export default router;
