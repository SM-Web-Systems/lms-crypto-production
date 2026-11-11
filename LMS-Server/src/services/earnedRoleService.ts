import { db,queryOne,execute } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { ensureLearnerProfile } from './rbacAccountService.js';
import { v4 as uuidv4 } from 'uuid';

/** Positive learning award only: current permissions remain authoritative.
 * Keep the existing distinct-course/tenant-threshold rule. Revoked or deleted
 * learners cannot regain access through a staff-authored completion.
 */
export function awardSuperStudentIfEligible(userId:string):boolean {
  return db.transaction(()=>{
    const user=queryOne<{deletion_status:string|null}>('SELECT deletion_status FROM users WHERE id=?',[userId]);
    if(!user || user.deletion_status==='finalized' || user.deletion_status==='pending_deletion') return false;
    const permissions=new Set(getUserPermissions(userId));
    if(!permissions.has('course.submit') || !permissions.has('course.view')) return false;
    if(queryOne("SELECT 1 FROM user_roles WHERE user_id=? AND role_id='role_supporter_student'",[userId])) return false;
    const count=queryOne<{cnt:number}>('SELECT COUNT(DISTINCT course_id) AS cnt FROM lesson_completions WHERE user_id=? AND completed_at IS NOT NULL',[userId])?.cnt ?? 0;
    const configured=queryOne<{super_student_threshold:number}>(`SELECT ts.super_student_threshold
      FROM tenant_settings ts JOIN tenant_users tu ON ts.tenant_id=tu.tenant_id WHERE tu.user_id=?`,[userId]);
    if(count<(configured?.super_student_threshold ?? 3)) return false;
    if(!queryOne("SELECT 1 FROM roles WHERE id='role_supporter_student' AND name='super-student' AND is_system=1")) return false;
    execute("INSERT INTO user_roles(user_id,role_id) VALUES(?,'role_supporter_student')",[userId]);
    ensureLearnerProfile(userId);
    execute("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'system','Super Student Promotion','Congratulations! You''ve been promoted to Super Student!')",[uuidv4(),userId]);
    execute("INSERT INTO audit_log(action,actor_id,target_id,details) VALUES('rbac.earned_role_granted','system:learning',?,'roleId=role_supporter_student')",[userId]);
    // This trusted positive-only award keeps the active session. APIs load
    // current DB capabilities; /auth/me refresh exposes the new role.
    return true;
  }).immediate();
}
