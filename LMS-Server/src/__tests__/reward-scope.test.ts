import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import {
  validateScope,
  resolveAudienceMembers,
  createAudienceSnapshot,
  isSnapshotMember,
} from '../services/rewards/rewardScopeService.js';

function createUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

function createCohort(sponsorId: string, courseId: string): string {
  const id = uuidv4();
  const code = `C-${courseId.slice(0, 8)}`;
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, code);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(id, sponsorId, courseId);
  return id;
}

function addCohortMember(cohortId: string, userId: string): void {
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, userId);
}

function createGroup(ownerId: string, groupType: string): string {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)'
  ).run(id, `Test ${groupType}`, groupType, ownerId);
  return id;
}

function addGroupMember(groupId: string, userId: string): void {
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, userId);
}

function createParentLink(parentId: string, childId: string): void {
  db.prepare(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')"
  ).run(uuidv4(), parentId, childId);
}

function createReward(creatorId: string, scopeType: string, scopeId: string): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
     VALUES (?, ?, ?, ?, 'custom', 100, ?)`
  ).run(id, creatorId, scopeType, scopeId, `idem-${id}`);
  return id;
}

describe('Reward Scope Service', () => {
  it('R-SCOPE-1: Sponsor can only access own cohort members', () => {
    const sponsor = createUser('admin');
    const courseId = uuidv4();
    const cohortId = createCohort(sponsor, courseId);

    expect(validateScope(sponsor, 'sponsor_cohort', cohortId)).toBe(true);

    const otherSponsor = createUser('admin');
    expect(validateScope(otherSponsor, 'sponsor_cohort', cohortId)).toBe(false);
  });

  it('R-SCOPE-2: Employer can only access own team members', () => {
    const employer = createUser('admin');
    const teamId = createGroup(employer, 'team');

    expect(validateScope(employer, 'employer_team', teamId)).toBe(true);

    const other = createUser('admin');
    expect(validateScope(other, 'employer_team', teamId)).toBe(false);
  });

  it('R-SCOPE-3: Parent can only access linked children', () => {
    const parent = createUser('admin');
    const child = createUser();
    createParentLink(parent, child);

    expect(validateScope(parent, 'parent_child', child)).toBe(true);

    const otherChild = createUser();
    expect(validateScope(parent, 'parent_child', otherChild)).toBe(false);
  });

  it('R-SCOPE-4: Teacher can only access own class students', () => {
    const teacher = createUser('lecturer');
    const classId = createGroup(teacher, 'class');

    expect(validateScope(teacher, 'teacher_class', classId)).toBe(true);

    const other = createUser('lecturer');
    expect(validateScope(other, 'teacher_class', classId)).toBe(false);
  });

  it('R-SCOPE-5: Cross-scope access denied', () => {
    const sponsor = createUser('admin');
    const courseId = uuidv4();
    const cohortId = createCohort(sponsor, courseId);

    // Sponsor tries to access as employer_team — should fail
    expect(validateScope(sponsor, 'employer_team', cohortId)).toBe(false);
  });

  it('R-SCOPE-6: Audience snapshot created at activation', () => {
    const sponsor = createUser('admin');
    const student1 = createUser();
    const student2 = createUser();
    const courseId = uuidv4();
    const cohortId = createCohort(sponsor, courseId);
    addCohortMember(cohortId, student1);
    addCohortMember(cohortId, student2);

    const rewardId = createReward(sponsor, 'sponsor_cohort', cohortId);

    const members = resolveAudienceMembers('sponsor_cohort', cohortId, sponsor);
    expect(members).toHaveLength(2);
    expect(members).toContain(student1);
    expect(members).toContain(student2);

    const count = createAudienceSnapshot(rewardId, members);
    expect(count).toBe(2);
  });

  it('R-SCOPE-7: Post-activation membership change does not expand snapshot', () => {
    const sponsor = createUser('admin');
    const student1 = createUser();
    const courseId = uuidv4();
    const cohortId = createCohort(sponsor, courseId);
    addCohortMember(cohortId, student1);

    const rewardId = createReward(sponsor, 'sponsor_cohort', cohortId);
    const members = resolveAudienceMembers('sponsor_cohort', cohortId, sponsor);
    createAudienceSnapshot(rewardId, members);

    // Add a new member after snapshot
    const student2 = createUser();
    addCohortMember(cohortId, student2);

    // New member is NOT in snapshot
    expect(isSnapshotMember(rewardId, student1)).toBe(true);
    expect(isSnapshotMember(rewardId, student2)).toBe(false);
  });

  it('R-SCOPE-8: Allocation only for snapshot members', () => {
    const sponsor = createUser('admin');
    const student = createUser();
    const courseId = uuidv4();
    const cohortId = createCohort(sponsor, courseId);
    addCohortMember(cohortId, student);

    const rewardId = createReward(sponsor, 'sponsor_cohort', cohortId);
    createAudienceSnapshot(rewardId, [student]);

    expect(isSnapshotMember(rewardId, student)).toBe(true);

    const outsider = createUser();
    expect(isSnapshotMember(rewardId, outsider)).toBe(false);
  });

  it('R-SCOPE-9: resolveAudienceMembers for parent_child returns single child', () => {
    const parent = createUser('admin');
    const child = createUser();
    createParentLink(parent, child);

    const members = resolveAudienceMembers('parent_child', child, parent);
    expect(members).toEqual([child]);
  });
});
