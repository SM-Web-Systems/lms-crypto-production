/** SQL scopes for search. Callers must still check the capability for each result type. */
export function searchCourseScope(userId: string, permissions: Set<string>, staffOnly = false): { sql: string; params: unknown[] } {
  // Keep the existing administrator course boundary: platform courses + own tenants.
  if (permissions.has('course.delete')) {
    if (permissions.has('tenant.manage')) return { sql: '1 = 1', params: [] };
    return {
      sql: `(c.id IS NOT NULL AND (c.tenant_id IS NULL OR c.tenant_id IN
        (SELECT tenant_id FROM tenant_users WHERE user_id = ? AND tenant_role = 'admin')))`,
      params: [userId],
    };
  }
  const scopes: string[] = [];
  const params: unknown[] = [];
  if (permissions.has('course.manage')) {
    scopes.push('c.id IN (SELECT course_id FROM course_lecturers WHERE user_id = ?)');
    params.push(userId);
  }
  if (permissions.has('course.grade_pending')) {
    scopes.push('c.id IN (SELECT course_id FROM course_tas WHERE user_id = ?)');
    params.push(userId);
  }
  if (!staffOnly) {
    scopes.push(`(c.course_code IN (SELECT course_code FROM user_course_codes WHERE user_id = ?)
      AND c.approval_status IN ('approved', 'published'))`);
    params.push(userId);
    if (permissions.has('cohort.view_own')) {
      scopes.push('c.id IN (SELECT course_id FROM sponsor_cohorts WHERE sponsor_user_id = ?)');
      params.push(userId);
    }
  }
  return { sql: scopes.length ? `(${scopes.join(' OR ')})` : '0 = 1', params };
}

export function searchDirectoryScope(userId: string, permissions: Set<string>): { sql: string; params: unknown[] } {
  if (permissions.has('tenant.manage')) return { sql: '1 = 1', params: [] };
  // Directory capability permits platform users and members of the caller's tenants;
  // it does not confer any access to those users' credentials or quiz analytics.
  return {
    sql: `(NOT EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.user_id = u.id)
      OR EXISTS (SELECT 1 FROM tenant_users target_tu JOIN tenant_users caller_tu
        ON target_tu.tenant_id = caller_tu.tenant_id
        WHERE target_tu.user_id = u.id AND caller_tu.user_id = ?))`,
    params: [userId],
  };
}
