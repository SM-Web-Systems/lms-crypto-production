import { v4 as uuidv4 } from 'uuid';
import { db, execute, query, queryOne } from '../config/database.js';
import type { LegacyRole, User } from '../types/index.js';
import type { AmmaWalletSSOUser, WalletLinkContext } from './ammaWalletSSOService.js';
import { invalidateAuthorization } from './roleSecurityService.js';

export class SsoPolicyError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/** One immediate transaction makes conflict checking and binding indivisible across callbacks. */
export function resolveAmmaAccount(identity: AmmaWalletSSOUser, initialRole: LegacyRole, link?: WalletLinkContext) {
  const email = identity.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SsoPolicyError('email_required');
  if (!identity.isEmailVerified) throw new SsoPolicyError('email_unverified');

  return db.transaction(() => {
    const matches = query<User>('SELECT * FROM users WHERE ammawallet_user_id = ?', [identity.userId]);
    if (matches.length > 1) throw new SsoPolicyError('identity_conflict');
    let user = matches[0];
    if (link) {
      const target = queryOne<User & {authorization_version: number; deletion_status: string}>(
        'SELECT * FROM users WHERE id = ?', [link.userId]);
      const session = queryOne<{revoked_at: string | null; expired: number}>(
        "SELECT revoked_at, datetime(expires_at) <= datetime('now') AS expired FROM active_sessions WHERE token_hash = ? AND user_id = ?",
        [link.sessionHash, link.userId]);
      if (!target || target.authorization_version !== link.authorizationVersion
        || link.sessionExpires <= Date.now() / 1000 || session?.revoked_at || session?.expired
        || (target.deletion_status && target.deletion_status !== 'active')) throw new SsoPolicyError('link_expired');
      if ((user && user.id !== target.id) || (target.ammawallet_user_id && target.ammawallet_user_id !== identity.userId)) {
        throw new SsoPolicyError('identity_conflict');
      }
      // Password confirmation authorizes only this existing account and the same verified email.
      // Once bound, immutable ID wins even if Wallet later changes its verified email.
      if (!target.ammawallet_user_id && target.email.toLowerCase() !== email) throw new SsoPolicyError('link_email_mismatch');
      user = target;
      if (!target.ammawallet_user_id) invalidateAuthorization(target.id);
    } else if (!user) {
      const emailOwner = queryOne<User>('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email]);
      if (emailOwner) throw new SsoPolicyError(emailOwner.ammawallet_user_id ? 'identity_conflict' : 'link_required');
    }

    if (user) {
      if ((user as User & {deletion_status?: string}).deletion_status === 'finalized') throw new SsoPolicyError('account_unavailable');
      // Null is authoritative: current linkage is a sign-in snapshot, never credential history.
      execute(`UPDATE users SET auth_provider = 'ammawallet', ammawallet_user_id = ?,
        walletAddress = ?, wallet_linking_status = ?, updated_at = datetime('now') WHERE id = ?`,
      [identity.userId, identity.mainnetWalletAddress, identity.mainnetWalletAddress ? 'linked' : 'none', user.id]);
    } else {
      const id = uuidv4();
      const name = [identity.firstName, identity.lastName].filter(Boolean).join(' ') || email.split('@')[0];
      execute(`INSERT INTO users(id, name, email, password_hash, role, auth_provider, ammawallet_user_id, walletAddress, wallet_linking_status)
        VALUES (?, ?, ?, '$sso$', ?, 'ammawallet', ?, ?, ?)`,
      [id, name, email, initialRole, identity.userId, identity.mainnetWalletAddress, identity.mainnetWalletAddress ? 'linked' : 'none']);
      if (initialRole === 'student') {
        execute(`INSERT INTO students(id, user_id, name, email, enrollment_number, department, semester)
          VALUES (?, ?, ?, ?, ?, 'General', 1)`,
        [uuidv4(), id, name, email, `REG-${id.replace(/-/g, '').slice(0, 12).toUpperCase()}`]);
      }
      user = queryOne<User>('SELECT * FROM users WHERE id = ?', [id])!;
    }
    return {
      user: queryOne<User>('SELECT * FROM users WHERE id = ?', [user.id])!,
      studentId: queryOne<{id: string}>('SELECT id FROM students WHERE user_id = ?', [user.id])?.id,
    };
  }).immediate();
}
