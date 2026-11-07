// Synthetic reporting acceptance data. No application imports or provider calls.
export interface ReportingDatabase {
  prepare(sql: string): { run(...values: unknown[]): unknown; get(...values: unknown[]): any; all(...values: unknown[]): any[] };
}
export const REPORT_PREFIX = 'e2e-report-';
export const REPORT_NAMES = ['Empty cohort', 'Zero cohort', 'Partial, "quoted" cohort', 'Full cohort'];

export function seedSponsorReporting(db: ReportingDatabase, owner: string, otherOwner: string) {
  const add = (sql: string, ...values: unknown[]) => db.prepare(sql).run(...values);
  for (const [name, size] of [['a', 2], ['b', 3]] as const) {
    const id = REPORT_PREFIX + name;
    const sections = [{ id: 'section', title: 'Learning', items: Array.from({ length: size }, (_, i) => ({ id: `lesson-${i + 1}`, title: `Lesson ${i + 1}`, type: 'text', content: 'Synthetic lesson' })) }];
    add('INSERT INTO courses(id,title,course_code,sections) VALUES (?,?,?,?)', id, `Report course ${name.toUpperCase()}`, `REPORT-${name}`, JSON.stringify(sections));
    add('INSERT INTO course_completion_requirements(id,course_id,require_all_lessons) VALUES (?,?,1)', id, id);
  }
  const cohorts = [
    ['empty', REPORT_NAMES[0], 'a', '2026-03-14 23:59:59'],
    ['zero', REPORT_NAMES[1], 'a', '2026-03-15T00:00:00Z'],
    ['partial', REPORT_NAMES[2], 'a', '2026-03-15 23:59:59'],
    ['full', REPORT_NAMES[3], 'b', '2026-03-16T00:00:00Z'],
    ['hidden', 'Other owner cohort', 'a', '2026-03-15'],
  ];
  for (const [id, name, course, date] of cohorts) add(
    "INSERT INTO sponsor_cohorts(id,name,sponsor_user_id,course_id,status,created_at) VALUES (?,?,?,?,'active',?)",
    REPORT_PREFIX + id, name, id === 'hidden' ? otherOwner : owner, REPORT_PREFIX + course, date);
  const members = [
    ['zero-1', 'zero', 'a', 0], ['zero-2', 'zero', 'a', 0],
    ['partial-1', 'partial', 'a', 2], ['partial-2', 'partial', 'a', 1], ['partial-3', 'partial', 'a', 0],
    ['full-1', 'full', 'b', 3], ['full-2', 'full', 'b', 3], ['hidden-1', 'hidden', 'a', 2],
  ] as const;
  for (const [name, cohort, course, lessons] of members) {
    const user = REPORT_PREFIX + name;
    add("INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,'synthetic-nonlogin-fixture')", user, name, `${user}@example.invalid`);
    add("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_student')", user);
    add('INSERT INTO cohort_members(cohort_id,user_id) VALUES (?,?)', REPORT_PREFIX + cohort, user);
    for (let lesson = 1; lesson <= lessons; lesson++) add(
      'INSERT INTO lesson_completions(id,user_id,course_id,item_id,section_id,completed_at) VALUES (?,?,?,?,?,?)',
      `${user}-${lesson}`, user, REPORT_PREFIX + course, `lesson-${lesson}`, 'section', '2026-03-15T12:00:00Z');
  }
  // An application alone is not completion; completed learners need not apply.
  for (const [name, course, status] of [['zero-1', 'a', 'pending'], ['partial-1', 'a', 'approved'], ['full-1', 'b', 'minted'], ['full-2', 'b', 'approved']]) {
    const id = REPORT_PREFIX + name;
    add('INSERT INTO course_nft_applications(id,user_id,course_id,wallet_address,status) VALUES (?,?,?,?,?)', id, id, REPORT_PREFIX + course, 'SYNTHETIC-NOT-A-WALLET', status);
    add('UPDATE cohort_members SET application_id=? WHERE user_id=?', id, id);
  }
  for (const [name, course] of [['partial-1', 'a'], ['full-2', 'b']]) add(
    'INSERT INTO certificate_badges(id,user_id,course_id,application_id,badge_svg,badge_hash) VALUES (?,?,?,?,?,?)',
    REPORT_PREFIX + name, REPORT_PREFIX + name, REPORT_PREFIX + course, REPORT_PREFIX + name, '<svg/>', 'synthetic-badge');
  add("INSERT INTO nft_credentials(id,user_id,course_id,wallet_address,contract_id,mint_status,network) VALUES (?,?,?,?,?,'minted','testnet')",
    REPORT_PREFIX + 'nft', REPORT_PREFIX + 'full-1', REPORT_PREFIX + 'b', 'SYNTHETIC', 'SYNTHETIC');
  for (const [name, cohort, currency, amount, status, date] of [
    ['usd', 'zero', 'USD', 10000, 'confirmed', '2026-03-15T00:00:00Z'],
    ['zar', 'partial', 'ZAR', 25000, 'confirmed', '2026-03-15 23:59:59'],
    ['pending', 'full', 'USD', 5000, 'pending', '2026-03-16T00:00:00Z'],
    ['refunded', 'empty', 'ZAR', 9000, 'refunded', '2026-03-14 23:59:59'],
    ['hidden', 'hidden', 'EUR', 99999, 'confirmed', '2026-03-15'],
  ] as const) {
    const payment = REPORT_PREFIX + name + '-payment';
    add('INSERT INTO payments(id,user_id,course_id,amount_cents,currency,payment_method,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      payment, name === 'hidden' ? otherOwner : owner, REPORT_PREFIX + (cohort === 'full' ? 'b' : 'a'), amount, currency, 'manual', status, date, date);
    add('UPDATE sponsor_cohorts SET payment_id=? WHERE id=?', payment, REPORT_PREFIX + cohort);
  }
}

// Independent SQL oracle for this fixture's all-lessons courses, not application
// service calls or copies of report outputs. Counts seats per cohort explicitly.
export function expectedSponsorImpact(db: ReportingDatabase, owner: string) {
  return db.prepare(`SELECT sc.id AS cohort_id, sc.name AS cohort_name,
    COUNT(cm.user_id) AS member_count,
    SUM(CASE WHEN cm.user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM json_each(c.sections, '$[0].items') item WHERE NOT EXISTS (
        SELECT 1 FROM lesson_completions lc WHERE lc.user_id=cm.user_id
          AND lc.course_id=c.id AND lc.item_id=json_extract(item.value,'$.id') AND lc.completed_at IS NOT NULL
      )) THEN 1 ELSE 0 END) AS completed_count,
    SUM(CASE WHEN EXISTS (SELECT 1 FROM certificate_badges b WHERE b.user_id=cm.user_id AND b.course_id=c.id)
      OR EXISTS (SELECT 1 FROM nft_credentials n WHERE n.user_id=cm.user_id AND n.course_id=c.id AND n.mint_status='minted')
      THEN 1 ELSE 0 END) AS certificate_count
    FROM sponsor_cohorts sc JOIN courses c ON c.id=sc.course_id
    LEFT JOIN cohort_members cm ON cm.cohort_id=sc.id WHERE sc.sponsor_user_id=?
    GROUP BY sc.id ORDER BY sc.id`).all(owner);
}
