import { v4 as uuidv4 } from 'uuid';
import { db, execute, queryOne } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';

export type InitialRoleId = 'role_student' | 'role_instructor' | 'role_admin';

/** Profile storage is independent of display labels and of a single primary role. */
export function ensureLearnerProfile(userId: string): string | undefined {
  const existing = queryOne<{id:string}>('SELECT id FROM students WHERE user_id = ?', [userId]);
  if (existing) return existing.id;
  if (!getUserPermissions(userId).includes('course.submit')) return undefined;
  const user = queryOne<{name:string;email:string;deletion_status:string|null}>('SELECT name,email,deletion_status FROM users WHERE id = ?', [userId]);
  if (!user) throw new AppError('User not found',404,ErrorCodes.NOT_FOUND);
  if (user.deletion_status==='finalized' || user.deletion_status==='pending_deletion') return undefined;
  const id = uuidv4();
  execute(`INSERT INTO students(id,user_id,name,email,enrollment_number,department,semester)
    VALUES(?,?,?,?,?,'General',1)`, [id,userId,user.name,user.email,'REG-'+userId.replace(/-/g,'').toUpperCase()]);
  return id;
}

/** Caller selects a trusted canonical grant, never a public role/display label. */
export function createRbacAccount(input: {
  id?: string; name: string; email: string; passwordHash: string;
  initialRoleId: InitialRoleId; authProvider?: 'local' | 'ammawallet';
  ammaWalletUserId?: string; walletAddress?: string | null;
  walletLinkingStatus?: 'none' | 'linked' | 'existing_account';
}) {
  return db.transaction(() => {
    const names:Record<InitialRoleId,string>={role_student:'student',role_instructor:'instructor',role_admin:'admin'};
    const role = queryOne<{id:string}>('SELECT id FROM roles WHERE id = ? AND name = ? AND is_system = 1', [input.initialRoleId,names[input.initialRoleId]]);
    if (!role) throw new AppError('Initial role is unavailable',500,ErrorCodes.INTERNAL_ERROR);
    const id = input.id ?? uuidv4();
    // New identities receive only explicit RBAC grants and start versioned.
    if(input.authProvider==='ammawallet') {
      execute(`INSERT INTO users(id,name,email,password_hash,authorization_version,auth_provider,
        ammawallet_user_id,walletAddress,wallet_linking_status) VALUES(?,?,?,?,1,'ammawallet',?,?,?)`,
      [id,input.name,input.email,input.passwordHash,input.ammaWalletUserId ?? null,
        input.walletAddress ?? null,input.walletLinkingStatus ?? 'none']);
    } else {
      execute(`INSERT INTO users(id,name,email,password_hash,authorization_version,walletAddress,wallet_linking_status)
        VALUES(?,?,?,?,1,?,?)`,[id,input.name,input.email,input.passwordHash,input.walletAddress ?? null,input.walletLinkingStatus ?? 'none']);
    }
    execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [id,input.initialRoleId]);
    return {id,studentId:ensureLearnerProfile(id)};
  }).immediate();
}
