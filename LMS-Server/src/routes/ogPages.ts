/**
 * OG Pages — Phase 25 C2: Dynamic Open Graph tags for certificate verification.
 *
 * Serves a standalone HTML page at /verify/:credentialId with dynamic OG meta tags.
 * Social crawlers (LinkedIn, Twitter, WhatsApp) read the tags from the initial HTML.
 * Requires nginx to route /verify/ to Express (not the SPA container).
 */

import { Router, Request, Response } from 'express';
import { queryOne } from '../config/database.js';

const router = Router();

const SITE_NAME = 'SM Web Systems Blockchain Academy';
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'https://lms.smwebsystems.com').replace(/\/$/, '');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderVerifyPage(cred: {
  credentialId: string;
  studentName: string;
  courseTitle: string;
  courseCode: string;
  walletAddress: string;
  txHash: string | null;
  network: string;
  issuedAt: string;
}): string {
  const ogTitle = `${cred.studentName}'s ${cred.courseTitle} Certificate`;
  const ogDesc = `Blockchain-verified NFT certificate issued by ${SITE_NAME}. Verified on the Stellar network.`;
  const ogUrl = `${FRONTEND_URL}/verify/${cred.credentialId}`;
  const explorerUrl = cred.txHash
    ? `https://stellar.expert/explorer/${cred.network}/tx/${cred.txHash}`
    : null;
  const issuedDate = new Date(cred.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ogTitle)} | ${escapeHtml(SITE_NAME)}</title>
  <meta name="description" content="${escapeHtml(ogDesc)}" />
  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDesc)}" />
  <meta property="og:url" content="${escapeHtml(ogUrl)}" />
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { max-width: 480px; width: 100%; margin: 2rem; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #3d7a8c 0%, #2d5a6b 100%); color: #fff; padding: 2rem; text-align: center; }
    .header h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
    .header p { font-size: 0.875rem; opacity: 0.9; }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.2); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 600; margin-top: 1rem; }
    .body { padding: 1.5rem 2rem; }
    .field { margin-bottom: 1rem; }
    .field label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .field p { font-size: 0.875rem; margin-top: 0.25rem; word-break: break-all; }
    .footer { padding: 1rem 2rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.75rem; color: #94a3b8; }
    a { color: #3d7a8c; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${escapeHtml(cred.courseTitle)}</h1>
      <p>Awarded to <strong>${escapeHtml(cred.studentName)}</strong></p>
      <div class="badge">&#x2714; Blockchain Verified</div>
    </div>
    <div class="body">
      <div class="field"><label>Course Code</label><p>${escapeHtml(cred.courseCode)}</p></div>
      <div class="field"><label>Issued</label><p>${escapeHtml(issuedDate)}</p></div>
      <div class="field"><label>Wallet</label><p>${escapeHtml(cred.walletAddress)}</p></div>
      <div class="field"><label>Network</label><p>${escapeHtml(cred.network)}</p></div>
      ${explorerUrl ? `<div class="field"><a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener">View on Blockchain Explorer &rarr;</a></div>` : ''}
    </div>
    <div class="footer">${escapeHtml(SITE_NAME)}</div>
  </div>
</body>
</html>`;
}

function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificate Not Found | ${escapeHtml(SITE_NAME)}</title>
  <meta property="og:title" content="Certificate Not Found" />
  <meta property="og:description" content="This certificate could not be found or has not been issued yet." />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .msg { text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #64748b; }
  </style>
</head>
<body><div class="msg"><h1>Certificate Not Found</h1><p>This certificate could not be found or has not been issued yet.</p></div></body>
</html>`;
}

router.get('/verify/:credentialId', (req: Request, res: Response): void => {
  const { credentialId } = req.params;

  const row = queryOne<{
    id: string;
    student_name: string | null;
    course_title: string | null;
    course_code: string | null;
    wallet_address: string;
    tx_hash: string | null;
    network: string;
    created_at: string;
  }>(
    `SELECT nc.id, u.name AS student_name, c.title AS course_title,
            c.course_code, nc.wallet_address, nc.tx_hash,
            nc.network, nc.created_at
     FROM nft_credentials nc
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN users u ON u.id = nc.user_id
     WHERE nc.id = ? AND nc.mint_status = 'minted' AND nc.is_superseded = 0`,
    [credentialId],
  );

  if (!row) {
    res.status(404).send(render404Page());
    return;
  }

  res.send(renderVerifyPage({
    credentialId: row.id,
    studentName: row.student_name ?? 'Certificate Holder',
    courseTitle: row.course_title ?? 'Certificate',
    courseCode: row.course_code ?? '',
    walletAddress: row.wallet_address,
    txHash: row.tx_hash,
    network: row.network,
    issuedAt: row.created_at,
  }));
});

export default router;
