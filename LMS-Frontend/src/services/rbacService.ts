/**
 * RBAC Admin Service — Phase 16 C4.
 * Frontend service for role CRUD, permission management, and user-role assignment.
 */

import api from './api';
import { assertApiSuccess } from '../utils/apiError';

export interface RbacRole {
  id: string;
  name: string;
  label: string;
  description: string | null;
  is_system: number;
  created_at: string;
}

export interface RbacPermission {
  id: string;
  name: string;
  category: string;
  label: string;
}

export interface UserRole {
  role_id: string;
  role_name: string;
  role_label: string;
  granted_at: string;
}

export const rbacService = {
  /** List all roles */
  async getRoles(): Promise<RbacRole[]> {
    const response = await api.get<{ success: boolean; data: RbacRole[] }>('/admin/roles');
    return assertApiSuccess(response, 'Could not load roles.');
  },

  /** Create a custom role */
  async createRole(name: string, label: string, description?: string): Promise<{ id: string; name: string; label: string }> {
    const response = await api.post<{ success: boolean; data: { id: string; name: string; label: string } }>(
      '/admin/roles',
      { name, label, description },
    );
    return assertApiSuccess(response, 'Could not create role.');
  },

  /** Update a custom role */
  async updateRole(roleId: string, updates: { label?: string; description?: string }): Promise<void> {
    await api.put(`/admin/roles/${roleId}`, updates);
  },

  /** Delete a custom role */
  async deleteRole(roleId: string): Promise<void> {
    await api.delete(`/admin/roles/${roleId}`);
  },

  /** List all permissions */
  async getPermissions(): Promise<RbacPermission[]> {
    const response = await api.get<{ success: boolean; data: RbacPermission[] }>('/admin/permissions');
    return assertApiSuccess(response, 'Could not load permissions.');
  },

  /** Get permissions assigned to a role */
  async getRolePermissions(roleId: string): Promise<RbacPermission[]> {
    const response = await api.get<{ success: boolean; data: RbacPermission[] }>(
      `/admin/roles/${roleId}/permissions`,
    );
    return assertApiSuccess(response, 'Could not load role permissions.');
  },

  /** Set permissions for a role */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await api.put(`/admin/roles/${roleId}/permissions`, { permissionIds });
  },

  /** Get roles assigned to a user */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const response = await api.get<{ success: boolean; data: UserRole[] }>(
      `/admin/users/${userId}/roles`,
    );
    return assertApiSuccess(response, 'Could not load user roles.');
  },

  /** Assign a role to a user */
  async assignUserRole(userId: string, roleId: string): Promise<void> {
    await api.post(`/admin/users/${userId}/roles`, { roleId });
  },

  /** Remove a role from a user */
  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await api.delete(`/admin/users/${userId}/roles/${roleId}`);
  },
};
