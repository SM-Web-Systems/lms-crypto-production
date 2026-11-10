import { createHash, timingSafeEqual } from 'node:crypto';
import { db, hashToken } from '../config/database.js';
import { verifyToken } from '../config/jwt.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const credentialPattern = /^[a-f0-9]{64}$/;
const expoToken = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,200}\]$/;
export class PushError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function pushConfiguration() {
  const projectId = process.env.EXPO_PUSH_PROJECT_ID ?? '';
  const accessToken = process.env.EXPO_PUSH_ACCESS_TOKEN ?? '';
  return { enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true' && uuid.test(projectId)
    && /^[\x21-\x7e]{10,500}$/.test(accessToken), projectId, accessToken };
}
export interface InstallationMutation { installationId: string; credential: string; generation: number }
export function validateInstallationMutation(value: unknown): InstallationMutation {
  const v = value as Partial<InstallationMutation> | null;
  if (!v || typeof v.installationId !== 'string' || !uuid.test(v.installationId)
    || typeof v.credential !== 'string' || !credentialPattern.test(v.credential)
    || !Number.isSafeInteger(v.generation) || v.generation! < 1) {
    throw new PushError(400, 'VALIDATION_ERROR', 'Invalid installation credentials or generation.');
  }
  return v as InstallationMutation;
}
type Installation = { credential_hash: string; generation: number; user_id: string|null;
  session_hash: string|null; expo_token: string|null; project_id: string|null; enabled: number; platform: string|null };
function existing(input: InstallationMutation): Installation | undefined {
  const row = db.prepare('SELECT * FROM push_installations WHERE id=?').get(input.installationId) as Installation|undefined;
  if (row && !timingSafeEqual(Buffer.from(row.credential_hash, 'hex'), Buffer.from(digest(input.credential), 'hex'))) {
    throw new PushError(403, 'FORBIDDEN', 'Installation credential does not match.');
  }
  if (row && row.generation > input.generation) throw new PushError(409, 'STALE_INSTALLATION', 'A newer installation update already exists.');
  return row;
}
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
function cancelPrevious(id: string) {
  db.prepare("UPDATE push_outbox SET state='cancelled',claim_id=NULL,lease_until=0,last_error='installation_changed' WHERE installation_id=? AND state IN ('pending','sending','awaiting_receipt')").run(id);
}
export function registerInstallation(raw: unknown, token: string, now = Date.now()) {
  const input = validateInstallationMutation(raw);
  const v = raw as InstallationMutation & { expoToken: string; projectId: string; platform: string };
  const config = pushConfiguration();
  if (!config.enabled) throw new PushError(503, 'PUSH_UNAVAILABLE', 'Push delivery is not configured.');
  if (v.projectId !== config.projectId || !expoToken.test(v.expoToken ?? '') || !['android','ios'].includes(v.platform)) {
    throw new PushError(400, 'VALIDATION_ERROR', 'Invalid push token, project or platform.');
  }
  const jwt = verifyToken(token);
  return db.transaction(() => {
    const user = db.prepare('SELECT authorization_version,password_changed_at,deletion_status FROM users WHERE id=?').get(jwt.userId) as
      {authorization_version:number;password_changed_at:string|null;deletion_status:string|null}|undefined;
    const sessionHash = hashToken(token);
    const session = db.prepare('SELECT expires_at,revoked_at FROM active_sessions WHERE token_hash=? AND user_id=?').get(sessionHash,jwt.userId) as {expires_at:string;revoked_at:string|null}|undefined;
    const epoch = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ','T')+'Z');
    if (!user || user.authorization_version !== (jwt.authorizationVersion ?? 0) || !session || session.revoked_at
      || epoch(session.expires_at) <= now || !jwt.iat || !jwt.exp || jwt.exp*1000 <= now
      || (user.password_changed_at && epoch(user.password_changed_at) > jwt.iat*1000)) {
      throw new PushError(401,'UNAUTHORIZED','Sign in again before enabling notifications.');
    }
    if (user.deletion_status === 'pending_deletion' || user.deletion_status === 'finalized') throw new PushError(403,'FORBIDDEN','Push is unavailable for this account.');
    const row = existing(input);
    if (row?.generation === input.generation && (!row.enabled || row.user_id !== jwt.userId || row.session_hash !== sessionHash
      || row.expo_token !== v.expoToken || row.project_id !== v.projectId || row.platform !== v.platform)) {
      throw new PushError(409,'STALE_INSTALLATION','Use a new generation for a changed binding.');
    }
    const claimed = db.prepare('SELECT id FROM push_installations WHERE expo_token=? AND id<>?').get(v.expoToken,input.installationId);
    if (claimed) throw new PushError(409,'TOKEN_ALREADY_BOUND','This push token is already bound to another installation.');
    if (!row || input.generation > row.generation) cancelPrevious(input.installationId);
    const expiresAt = Math.min(now+86_400_000, epoch(session.expires_at), jwt.exp*1000);
    db.prepare(`INSERT INTO push_installations (id,credential_hash,generation,user_id,session_hash,authorization_version,token_issued_at,expo_token,project_id,platform,enabled,lease_expires_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET generation=excluded.generation,user_id=excluded.user_id,
      session_hash=excluded.session_hash,authorization_version=excluded.authorization_version,token_issued_at=excluded.token_issued_at,
      expo_token=excluded.expo_token,project_id=excluded.project_id,platform=excluded.platform,enabled=1,lease_expires_at=excluded.lease_expires_at,updated_at=excluded.updated_at`)
      .run(input.installationId,digest(input.credential),input.generation,jwt.userId,sessionHash,user.authorization_version,jwt.iat,v.expoToken,v.projectId,v.platform,expiresAt,now);
    return { generation: input.generation, expiresAt };
  }).immediate();
}
/** Credential-authenticated cleanup works after logout and while replaying offline tombstones. */
export function unregisterInstallation(raw: unknown, now = Date.now()) {
  const input = validateInstallationMutation(raw);
  return db.transaction(() => {
    const row = existing(input);
    if (row?.generation === input.generation && row.enabled) throw new PushError(409,'STALE_INSTALLATION','Use a new generation to disable this binding.');
    cancelPrevious(input.installationId);
    db.prepare(`INSERT INTO push_installations (id,credential_hash,generation,enabled,lease_expires_at,updated_at)
      VALUES (?,?,?,0,0,?) ON CONFLICT(id) DO UPDATE SET generation=excluded.generation,user_id=NULL,session_hash=NULL,
      authorization_version=NULL,token_issued_at=NULL,expo_token=NULL,project_id=NULL,platform=NULL,enabled=0,lease_expires_at=0,updated_at=excluded.updated_at`)
      .run(input.installationId,digest(input.credential),input.generation,now);
    return {generation:input.generation};
  }).immediate();
}
