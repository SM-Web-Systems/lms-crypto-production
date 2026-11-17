import { StrKey } from '@stellar/stellar-sdk';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import { auditLog } from './auditService.js';
import { enqueueActivation, activationConfig } from './ammaActivationService.js';

/**
 * AmmaWallet creates an Amma-held wallet for an LMS learner and sends a mapping (LMS user id, AmmaWallet user id,
 * Stellar address). A super admin imports it here: the address becomes the learner's wallet, so later mints go to it,
 * and the AmmaWallet user id is kept for the activation call. Then the super admin queues one activation per learner
 * for an approved course certificate. The existing activation worker sends it, signed, when activation is switched on.
 */
export const MAX_IMPORT_ROWS = 200;

export interface WalletMappingRow { lmsUserId?: unknown; ammaUserId?: unknown; address?: unknown }
export type ImportOutcome = { lmsUserId: string; result: 'stored' | 'unchanged' | 'refused'; reason?: string; previousAddress?: string | null; alreadyMinted?: number };

export function importAmmaHeldWallets(actorId: string, rows: unknown): ImportOutcome[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new AppError('Send a non-empty list of wallets.', 400, ErrorCodes.VALIDATION_ERROR);
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError(`Send at most ${MAX_IMPORT_ROWS} wallets at a time.`, 400, ErrorCodes.VALIDATION_ERROR);
  return (rows as WalletMappingRow[]).map(row => importOne(actorId, row));
}

function importOne(actorId: string, row: WalletMappingRow): ImportOutcome {
  const lmsUserId = typeof row?.lmsUserId === 'string' ? row.lmsUserId.trim() : '';
  const address = typeof row?.address === 'string' ? row.address.trim() : '';
  const ammaUserId = Number(row?.ammaUserId);
  const refuse = (reason: string): ImportOutcome => ({ lmsUserId, result: 'refused', reason });
  if (!lmsUserId) return refuse('lmsUserId is missing');
  if (!Number.isSafeInteger(ammaUserId) || ammaUserId <= 0) return refuse('ammaUserId must be a positive whole number');
  if (!StrKey.isValidEd25519PublicKey(address)) return refuse('address is not a valid Stellar account address');

  const user = db.prepare('SELECT id, walletAddress FROM users WHERE id = ? AND deletion_status IS NULL').get(lmsUserId) as { id: string; walletAddress: string | null } | undefined;
  if (!user) return refuse('no LMS account with this id');
  const addressOwner = db.prepare('SELECT id FROM users WHERE walletAddress = ? AND id <> ?').get(address, lmsUserId) as { id: string } | undefined;
  if (addressOwner) return refuse('this address already belongs to another LMS account');
  const ammaOwner = db.prepare('SELECT user_id FROM amma_wallet_links WHERE amma_user_id = ? AND user_id <> ?').get(ammaUserId, lmsUserId) as { user_id: string } | undefined;
  if (ammaOwner) return refuse('this AmmaWallet user id is already linked to another LMS account');

  const existing = db.prepare('SELECT amma_user_id, wallet_address FROM amma_wallet_links WHERE user_id = ?').get(lmsUserId) as { amma_user_id: number; wallet_address: string } | undefined;
  if (existing && existing.amma_user_id === ammaUserId && existing.wallet_address === address && user.walletAddress === address) {
    return { lmsUserId, result: 'unchanged' };
  }
  const previous = user.walletAddress && user.walletAddress !== address ? user.walletAddress : null;
  const minted = (db.prepare(`SELECT COUNT(*) AS c FROM nft_credentials WHERE user_id = ? AND mint_status = 'minted' AND is_superseded = 0`).get(lmsUserId) as { c: number }).c;

  db.transaction(() => {
    db.prepare(`UPDATE users SET walletAddress = ?, wallet_linking_status = 'linked', updated_at = datetime('now') WHERE id = ?`).run(address, lmsUserId);
    db.prepare(`INSERT INTO amma_wallet_links (user_id, amma_user_id, wallet_address, previous_address, imported_by, imported_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET amma_user_id = excluded.amma_user_id, wallet_address = excluded.wallet_address,
        previous_address = COALESCE(excluded.previous_address, amma_wallet_links.previous_address), imported_by = excluded.imported_by, imported_at = excluded.imported_at`)
      .run(lmsUserId, ammaUserId, address, previous, actorId);
    // Applications not yet minted show the address the certificate will go to.
    db.prepare(`UPDATE course_nft_applications SET wallet_address = ? WHERE user_id = ? AND status IN ('pending','approved') AND wallet_address <> ''`).run(address, lmsUserId);
  })();
  auditLog({ action: 'amma_wallet.import', actorId, targetId: lmsUserId, details: `amma_user_id=${ammaUserId} address=${address}${previous ? ` previous=${previous}` : ''}` });
  return { lmsUserId, result: 'stored', previousAddress: previous, ...(minted ? { alreadyMinted: minted } : {}) };
}

export type QueueOutcome = { lmsUserId: string; result: 'queued' | 'already_queued' | 'refused'; reason?: string; activationId?: string };

/** Queues one activation per learner for their approved (or minted) certificate in this course. Safe to repeat. */
export function queueActivations(actorId: string, courseId: unknown, userIds: unknown): QueueOutcome[] {
  if (typeof courseId !== 'string' || !courseId) throw new AppError('courseId is required.', 400, ErrorCodes.VALIDATION_ERROR);
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > MAX_IMPORT_ROWS) throw new AppError(`Send between 1 and ${MAX_IMPORT_ROWS} user ids.`, 400, ErrorCodes.VALIDATION_ERROR);
  return userIds.map((raw): QueueOutcome => {
    const lmsUserId = typeof raw === 'string' ? raw : '';
    const link = db.prepare(`SELECT l.amma_user_id FROM amma_wallet_links l JOIN users u ON u.id = l.user_id
      WHERE l.user_id = ? AND u.walletAddress = l.wallet_address`).get(lmsUserId) as { amma_user_id: number } | undefined;
    if (!link) return { lmsUserId, result: 'refused', reason: 'no Amma-held wallet stored for this learner' };
    const app = db.prepare(`SELECT id, COALESCE(reviewed_at, applied_at) AS done_at FROM course_nft_applications
      WHERE user_id = ? AND course_id = ? AND status IN ('approved','minted') ORDER BY applied_at DESC LIMIT 1`).get(lmsUserId, courseId) as { id: string; done_at: string } | undefined;
    if (!app) return { lmsUserId, result: 'refused', reason: 'no approved certificate in this course' };
    const completedAt = new Date(app.done_at.includes('T') ? app.done_at : `${app.done_at.replace(' ', 'T')}Z`).toISOString();
    const { id, created } = enqueueActivation({ userId: lmsUserId, ammaUserId: link.amma_user_id, completionId: app.id, completedAt });
    if (created) auditLog({ action: 'amma_activation.queue', actorId, targetId: lmsUserId, details: `completion=${app.id} amma_user_id=${link.amma_user_id}` });
    return { lmsUserId, result: created ? 'queued' : 'already_queued', activationId: id };
  });
}

/** Wallet and activation state for each learner, for the seed script and admins. */
export function ammaWalletStatus(userIds: string[]) {
  return {
    activationSwitchedOn: !!activationConfig(),
    users: userIds.slice(0, MAX_IMPORT_ROWS).map(userId => {
      const user = db.prepare('SELECT walletAddress FROM users WHERE id = ?').get(userId) as { walletAddress: string | null } | undefined;
      const link = db.prepare('SELECT amma_user_id, wallet_address FROM amma_wallet_links WHERE user_id = ?').get(userId) as { amma_user_id: number; wallet_address: string } | undefined;
      const act = db.prepare(`SELECT status, remote_state, tx_hash, last_error, attempts FROM amma_activations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).get(userId) as
        { status: string; remote_state: string | null; tx_hash: string | null; last_error: string | null; attempts: number } | undefined;
      return {
        userId, found: !!user, walletAddress: user?.walletAddress ?? null,
        ammaHeld: !!link && link.wallet_address === user?.walletAddress, ammaUserId: link?.amma_user_id ?? null,
        activation: act ? { status: act.status, remoteState: act.remote_state, txHash: act.tx_hash, lastError: act.last_error, attempts: act.attempts } : null,
      };
    }),
  };
}
