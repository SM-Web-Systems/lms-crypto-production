import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, getUserRoles } from '../middleware/rbac.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { auditLog } from '../services/auditService.js';
import { revokeUserRole, ROLE_PRIVILEGE_LEVEL, getRoleManagementOptions, assignUserRole, replaceUserRoles, updateCustomRolePermissions, deleteCustomRole } from '../services/roleSecurityService.js';

const router = Router();

router.get('/users/:id/role-options', authenticate, requirePermission('user.assign_role'), (req: AuthRequest, res: Response, next) => {
  try { res.json({success: true, data: getRoleManagementOptions(req.user!.userId, req.params.id)}); }
  catch (error) { next(error); }
});

function getHighestPrivilegeLevel(roles: string[]): number {
  return Math.max(0, ...roles.map((r) => ROLE_PRIVILEGE_LEVEL[r] ?? 0));
}

/** PUT /admin/users/:id/roles replaces the complete RBAC role set atomically. */
router.put('/users/:id/roles',authenticate,requirePermission('user.assign_role'),(req:AuthRequest,res:Response,next)=>{
  try { replaceUserRoles(req.user!.userId,req.params.id,req.body?.roleIds); res.json({success:true,message:'Roles replaced'}); }
  catch(error) { next(error); }
});

// ─── Role CRUD ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/roles:
 *   get:
 *     tags: [RBAC]
 *     summary: List all roles
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of roles }
 *       403: { description: Requires system.manage_roles }
 */
// GET /api/v1/admin/roles — List all roles
router.get(
  '/roles',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response) => {
    const roles = query<{
      id: string; name: string; label: string; description: string | null;
      is_system: number; created_at: string;
    }>('SELECT id, name, label, description, is_system, created_at FROM roles ORDER BY name');
    res.json({ success: true, data: roles });
  },
);

/**
 * @openapi
 * /admin/roles:
 *   post:
 *     tags: [RBAC]
 *     summary: Create custom role
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, label]
 *             properties:
 *               name: { type: string }
 *               label: { type: string }
 *               description: { type: string }
 *     responses:
 *       201: { description: Role created }
 *       409: { description: Name already exists }
 */
// POST /api/v1/admin/roles — Create custom role
router.post(
  '/roles',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response) => {
    const { name, label, description } = req.body;
    if (!name || !label) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'name and label are required' },
      });
      return;
    }

    // Check duplicate
    const existing = queryOne<{ id: string }>('SELECT id FROM roles WHERE name = ?', [name]);
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: ErrorCodes.DUPLICATE_ENTRY, message: 'Role name already exists' },
      });
      return;
    }

    const id = `role_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    execute(
      'INSERT INTO roles (id, name, label, description, is_system, created_by) VALUES (?, ?, ?, ?, 0, ?)',
      [id, name, label, description ?? null, req.user!.userId],
    );

    auditLog({
      action: 'rbac.role_created',
      actorId: req.user!.userId,
      targetId: id,
      details: `name=${name} label=${label}`,
    });

    res.status(201).json({ success: true, data: { id, name, label } });
  },
);

/**
 * @openapi
 * /admin/roles/{id}:
 *   put:
 *     tags: [RBAC]
 *     summary: Update custom role
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Role updated }
 *       400: { description: Cannot modify system roles }
 */
// PUT /api/v1/admin/roles/:id — Update custom role
router.put(
  '/roles/:id',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response) => {
    const role = queryOne<{ id: string; is_system: number }>(
      'SELECT id, is_system FROM roles WHERE id = ?', [req.params.id],
    );
    if (!role) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Role not found' },
      });
      return;
    }
    if (role.is_system) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Cannot modify system roles' },
      });
      return;
    }

    const { label, description } = req.body;
    if (label) execute('UPDATE roles SET label = ? WHERE id = ?', [label, req.params.id]);
    if (description !== undefined) execute('UPDATE roles SET description = ? WHERE id = ?', [description, req.params.id]);

    auditLog({
      action: 'rbac.role_updated',
      actorId: req.user!.userId,
      targetId: req.params.id,
      details: `label=${label ?? '(unchanged)'} description=${description !== undefined ? '(set)' : '(unchanged)'}`,
    });

    res.json({ success: true, data: { id: req.params.id } });
  },
);

/**
 * @openapi
 * /admin/roles/{id}:
 *   delete:
 *     tags: [RBAC]
 *     summary: Delete custom role
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Role deleted }
 *       400: { description: Cannot delete system roles }
 */
// DELETE /api/v1/admin/roles/:id — Delete custom role (non-system only)
router.delete(
  '/roles/:id',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response, next) => {
    try { deleteCustomRole(req.user!.userId,req.params.id); res.json({success:true,message:'Role deleted'}); } catch(error) { next(error); }
  },
);

// ─── Permissions ────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/permissions:
 *   get:
 *     tags: [RBAC]
 *     summary: List all permissions
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of permissions }
 */
// GET /api/v1/admin/permissions — List all permissions
router.get(
  '/permissions',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response) => {
    const perms = query<{
      id: string; name: string; category: string; label: string;
    }>('SELECT id, name, category, label FROM permissions ORDER BY category, name');
    res.json({ success: true, data: perms });
  },
);

/**
 * @openapi
 * /admin/roles/{id}/permissions:
 *   get:
 *     tags: [RBAC]
 *     summary: Get role permissions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of role permissions }
 *       404: { description: Role not found }
 */
// GET /api/v1/admin/roles/:id/permissions — List role's permissions
router.get(
  '/roles/:id/permissions',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response) => {
    const role = queryOne<{ id: string }>('SELECT id FROM roles WHERE id = ?', [req.params.id]);
    if (!role) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Role not found' },
      });
      return;
    }

    const perms = query<{ id: string; name: string; category: string; label: string }>(
      `SELECT p.id, p.name, p.category, p.label
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?
       ORDER BY p.category, p.name`,
      [req.params.id],
    );
    res.json({ success: true, data: perms });
  },
);

/**
 * @openapi
 * /admin/roles/{id}/permissions:
 *   put:
 *     tags: [RBAC]
 *     summary: Set role permissions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [permissionIds]
 *             properties:
 *               permissionIds: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Permissions updated }
 *       400: { description: Cannot modify system role permissions }
 */
// PUT /api/v1/admin/roles/:id/permissions — Set role's permissions
router.put(
  '/roles/:id/permissions',
  authenticate,
  requirePermission('system.manage_roles'),
  (req: AuthRequest, res: Response, next) => {
    try { updateCustomRolePermissions(req.user!.userId,req.params.id,req.body?.permissionIds); res.json({success:true,message:'Permissions updated'}); } catch(error) { next(error); }
  },
);

// ─── User Role Assignment ───────────────────────────────────────────────────

/**
 * @openapi
 * /admin/users/{id}/roles:
 *   get:
 *     tags: [RBAC]
 *     summary: Get user roles
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User role list }
 */
// GET /api/v1/admin/users/:id/roles — List user's roles
router.get(
  '/users/:id/roles',
  authenticate,
  requirePermission('user.assign_role'),
  (req: AuthRequest, res: Response) => {
    const roles = query<{ role_id: string; role_name: string; role_label: string; granted_at: string }>(
      `SELECT r.id AS role_id, r.name AS role_name, r.label AS role_label,
              ur.created_at AS granted_at
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [req.params.id],
    );
    res.json({ success: true, data: roles });
  },
);

/**
 * @openapi
 * /admin/users/{id}/roles:
 *   post:
 *     tags: [RBAC]
 *     summary: Assign role to user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId: { type: string }
 *     responses:
 *       201: { description: Role assigned }
 *       403: { description: Privilege escalation blocked }
 */
// POST /api/v1/admin/users/:id/roles — Assign role to user
router.post(
  '/users/:id/roles',
  authenticate,
  requirePermission('user.assign_role'),
  (req: AuthRequest, res: Response, next) => {
    try { assignUserRole(req.user!.userId,req.params.id,req.body?.roleId); res.status(201).json({success:true,message:'Role assigned'}); } catch(error) { next(error); }
  },
);

/**
 * @openapi
 * /admin/users/{id}/roles/{roleId}:
 *   delete:
 *     tags: [RBAC]
 *     summary: Remove role from user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Role removed }
 *       403: { description: Cannot modify own roles }
 */
// DELETE /api/v1/admin/users/:id/roles/:roleId — Remove role from user
router.delete(
  '/users/:id/roles/:roleId',
  authenticate,
  requirePermission('user.assign_role'),
  (req: AuthRequest, res: Response, next) => {
    // ESC-5: Cannot modify own roles
    if (req.params.id === req.user!.userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Cannot remove roles from yourself' },
      });
      return;
    }

    let removedRole: string;
    try {
      removedRole = revokeUserRole(req.user!.userId, req.params.id, req.params.roleId);
    } catch (error) {
      next(error);
      return;
    }

    res.json({ success: true, message: 'Role removed' });
  },
);

export default router;
