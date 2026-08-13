/**
 * PermissionGate — Phase G: Conditionally renders children based on user role
 * or a list of allowed roles. Used for fine-grained UI visibility control.
 */

import React from 'react';
import { useAuth } from '../context/useAuth';
import type { UserRole } from '../types/api';

interface PermissionGateProps {
  /** Single role to allow */
  allowedRole?: UserRole;
  /** Multiple roles — child renders if user has ANY of these */
  allowedRoles?: UserRole[];
  /** What to render if user lacks permission (default: nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  allowedRole,
  allowedRoles,
  fallback = null,
  children,
}) => {
  const { user } = useAuth();
  const role = user?.role;

  if (!role) return <>{fallback}</>;

  if (allowedRoles) {
    return allowedRoles.includes(role) ? <>{children}</> : <>{fallback}</>;
  }

  if (allowedRole) {
    return role === allowedRole ? <>{children}</> : <>{fallback}</>;
  }

  // No restrictions specified — render children
  return <>{children}</>;
};
