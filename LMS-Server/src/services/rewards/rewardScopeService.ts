import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import type { ScopeType } from './rewardTypes.js';

/**
 * Validate that the actor has access to the given scope.
 * Returns true if the actor owns/manages the scope entity.
 */
export function validateScope(actorId: string, scopeType: ScopeType, scopeId: string): boolean {
  switch (scopeType) {
    case 'sponsor_cohort': {
      const cohort = db.prepare(
        'SELECT id FROM sponsor_cohorts WHERE id = ? AND sponsor_user_id = ?'
      ).get(scopeId, actorId);
      return !!cohort;
    }
    case 'employer_team':
    case 'parent_family':
    case 'teacher_class': {
      const groupType = scopeType === 'employer_team' ? 'team'
        : scopeType === 'parent_family' ? 'family'
        : 'class';
      const group = db.prepare(
        'SELECT id FROM user_groups WHERE id = ? AND owner_user_id = ? AND group_type = ?'
      ).get(scopeId, actorId, groupType);
      return !!group;
    }
    case 'parent_child': {
      // scope_id is the child user id
      const link = db.prepare(
        "SELECT id FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'"
      ).get(actorId, scopeId);
      return !!link;
    }
  }
}

/**
 * Resolve all student member IDs for a scope.
 */
export function resolveAudienceMembers(scopeType: ScopeType, scopeId: string, actorId: string): string[] {
  if (!validateScope(actorId, scopeType, scopeId)) {
    throw new RewardError('SCOPE_DENIED', `Actor ${actorId} does not have access to scope ${scopeType}:${scopeId}`, 403);
  }

  switch (scopeType) {
    case 'sponsor_cohort': {
      const members = db.prepare(
        'SELECT user_id FROM cohort_members WHERE cohort_id = ?'
      ).all(scopeId) as Array<{ user_id: string }>;
      return members.map(m => m.user_id);
    }
    case 'employer_team':
    case 'parent_family':
    case 'teacher_class': {
      const members = db.prepare(
        'SELECT user_id FROM user_group_members WHERE group_id = ?'
      ).all(scopeId) as Array<{ user_id: string }>;
      return members.map(m => m.user_id);
    }
    case 'parent_child': {
      // Single child
      return [scopeId];
    }
  }
}

/**
 * Create an audience snapshot for a reward by inserting member records.
 * Returns the number of members snapshotted.
 */
export function createAudienceSnapshot(rewardId: string, memberIds: string[]): number {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO reward_audience_snapshots (id, reward_id, student_user_id) VALUES (?, ?, ?)'
  );
  let count = 0;
  for (const memberId of memberIds) {
    const result = insert.run(uuidv4(), rewardId, memberId);
    if (result.changes > 0) count++;
  }
  return count;
}

/**
 * Check if a student is in the audience snapshot for a reward.
 */
export function isSnapshotMember(rewardId: string, studentId: string): boolean {
  const row = db.prepare(
    'SELECT id FROM reward_audience_snapshots WHERE reward_id = ? AND student_user_id = ?'
  ).get(rewardId, studentId);
  return !!row;
}

/**
 * Get all snapshot members for a reward.
 */
export function getSnapshotMembers(rewardId: string): string[] {
  const rows = db.prepare(
    'SELECT student_user_id FROM reward_audience_snapshots WHERE reward_id = ?'
  ).all(rewardId) as Array<{ student_user_id: string }>;
  return rows.map(r => r.student_user_id);
}
