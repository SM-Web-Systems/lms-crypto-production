/**
 * PermissionGate — renders children for effective workspaces and capabilities.
 * The allowedRole(s) prop names remain compatible with existing callers.
 */

import React from 'react';
import { useAuth } from '../context/useAuth';
import type { UserRole } from '../types/api';
import { availableWorkspaces, hasCapability } from '../utils/authorization';

interface PermissionGateProps {
  /** Single role to allow */
  allowedRole?: UserRole;
  /** Multiple roles — child renders if user has ANY of these */
  allowedRoles?: UserRole[];
  permissions?: string[];
  /** What to render if user lacks permission (default: nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  allowedRole,
  allowedRoles,
  permissions = [],
  fallback = null,
  children,
}) => {
  const { user } = useAuth();
  const workspaces = availableWorkspaces(user);

  if (!user || !permissions.every(p => hasCapability(user, p))) return <>{fallback}</>;

  if (allowedRoles) {
    return allowedRoles.some(role => role !== 'custom' && workspaces.includes(role)) ? <>{children}</> : <>{fallback}</>;
  }

  if (allowedRole) {
    return allowedRole !== 'custom' && workspaces.includes(allowedRole) ? <>{children}</> : <>{fallback}</>;
  }

  // No restrictions specified — render children
  return <>{children}</>;
};
