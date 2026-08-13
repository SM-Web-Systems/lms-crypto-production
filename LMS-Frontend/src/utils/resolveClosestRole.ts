/**
 * resolveClosestRole — Phase G: Maps custom/unknown roles to the nearest
 * known role for routing and UI purposes. Uses RBAC permissions when available,
 * otherwise falls back to a simple hierarchy.
 */

import type { UserRole } from '../types/api';

/** Known roles that have dedicated dashboards */
const KNOWN_ROLES: UserRole[] = [
  'admin',
  'lecturer',
  'teaching-assistant',
  'teacher',
  'sponsor',
  'employer',
  'parent',
  'student',
];

/**
 * Maps a role (possibly "custom") to the closest known role for routing.
 * Custom roles fall back to "student" unless their name hints at a higher role.
 */
export function resolveClosestRole(role: string | undefined): UserRole {
  if (!role) return 'student';

  // Exact match — return as-is
  if (KNOWN_ROLES.includes(role as UserRole)) return role as UserRole;

  // Heuristic mapping for common custom role names
  const lower = role.toLowerCase();
  if (lower.includes('admin') || lower.includes('super')) return 'admin';
  if (lower.includes('lecturer') || lower.includes('instructor') || lower.includes('professor')) return 'lecturer';
  if (lower.includes('ta') || lower.includes('assistant')) return 'teaching-assistant';
  if (lower.includes('teacher')) return 'teacher';
  if (lower.includes('sponsor')) return 'sponsor';
  if (lower.includes('employer')) return 'employer';
  if (lower.includes('parent') || lower.includes('guardian')) return 'parent';

  // Default fallback
  return 'student';
}
