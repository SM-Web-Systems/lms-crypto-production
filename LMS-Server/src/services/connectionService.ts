import { db } from '../config/database.js';

/**
 * Links between a learner and the people who can see their records: parents (user_links) and the owners of
 * the classes and teams they belong to (user_group_members). Either side can end a link at any time.
 */

export interface MyConnections {
  parents: Array<{ id: string; name: string; linkedAt: string }>;
  groups: Array<{ id: string; name: string; groupType: 'class' | 'team'; ownerName: string }>;
}

export function myConnections(userId: string): MyConnections {
  const parents = db.prepare(`SELECT p.id, p.name, l.created_at AS linkedAt FROM user_links l JOIN users p ON p.id = l.parent_user_id
    WHERE l.child_user_id = ? AND l.link_type = 'parent' ORDER BY p.name`).all(userId) as MyConnections['parents'];
  const groups = db.prepare(`SELECT g.id, g.name, g.group_type AS groupType, o.name AS ownerName
    FROM user_group_members m JOIN user_groups g ON g.id = m.group_id JOIN users o ON o.id = g.owner_user_id
    WHERE m.user_id = ? AND g.group_type IN ('class', 'team') ORDER BY g.group_type, g.name`).all(userId) as MyConnections['groups'];
  return { parents, groups };
}

/** Ends a parent link from either side. Also takes the learner out of that parent's family groups. */
export function unlinkParent(parentId: string, childId: string): boolean {
  return db.transaction(() => {
    const removed = db.prepare("DELETE FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'").run(parentId, childId).changes > 0;
    if (removed) {
      db.prepare(`DELETE FROM user_group_members WHERE user_id = ? AND group_id IN
        (SELECT id FROM user_groups WHERE owner_user_id = ? AND group_type = 'family')`).run(childId, parentId);
    }
    return removed;
  }).immediate();
}

/** The learner leaves a class or team. */
export function leaveGroup(userId: string, groupId: string): boolean {
  return db.prepare(`DELETE FROM user_group_members WHERE user_id = ? AND group_id = ?
    AND group_id IN (SELECT id FROM user_groups WHERE group_type IN ('class', 'team'))`).run(userId, groupId).changes > 0;
}

/** A teacher removes one learner from their own class. */
export function removeFromOwnClass(ownerId: string, classId: string, userId: string): 'removed' | 'no_class' | 'not_member' {
  if (!db.prepare("SELECT 1 FROM user_groups WHERE id = ? AND owner_user_id = ? AND group_type = 'class'").get(classId, ownerId)) return 'no_class';
  return db.prepare('DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?').run(classId, userId).changes > 0 ? 'removed' : 'not_member';
}
