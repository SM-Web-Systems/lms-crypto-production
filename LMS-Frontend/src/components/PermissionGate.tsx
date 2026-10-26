/**
 * PermissionGate — renders children for effective workspaces and capabilities.
 * Workspace identifiers are separate from extensible RBAC role names.
 */

import React from 'react';
import { useAuth } from '../context/useAuth';
import type { Workspace } from '../types/api';
import { availableWorkspaces, hasCapability } from '../utils/authorization';

interface PermissionGateProps {
  /** Single workspace to allow */
  allowedWorkspace?: Workspace;
  /** Multiple workspaces — child renders if user has ANY of these */
  allowedWorkspaces?: Workspace[];
  permissions?: string[];
  /** What to render if user lacks permission (default: nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  allowedWorkspace,
  allowedWorkspaces,
  permissions = [],
  fallback = null,
  children,
}) => {
  const { user } = useAuth();
  const workspaces = availableWorkspaces(user);

  if (!user || !permissions.every(p => hasCapability(user, p))) return <>{fallback}</>;

  if (allowedWorkspaces) {
    return allowedWorkspaces.some(role => workspaces.includes(role)) ? <>{children}</> : <>{fallback}</>;
  }

  if (allowedWorkspace) {
    return workspaces.includes(allowedWorkspace) ? <>{children}</> : <>{fallback}</>;
  }

  // No restrictions specified — render children
  return <>{children}</>;
};
