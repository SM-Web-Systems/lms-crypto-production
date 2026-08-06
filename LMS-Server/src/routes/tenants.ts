import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('tenant.manage'));

/**
 * @openapi
 * /admin/tenants:
 *   get:
 *     tags: [Tenants]
 *     summary: List tenants
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of tenants with user and course counts }
 *       403: { description: Requires tenant.manage }
 */
// GET /admin/tenants — list all tenants with counts
router.get('/', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const tenants = query<{
      id: string; name: string; slug: string; status: string;
      created_at: string; updated_at: string;
      userCount: number; courseCount: number;
    }>(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id) AS userCount,
        (SELECT COUNT(*) FROM courses c WHERE c.tenant_id = t.id) AS courseCount
      FROM tenants t
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, data: { tenants } });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants:
 *   post:
 *     tags: [Tenants]
 *     summary: Create tenant
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *     responses:
 *       201: { description: Tenant created }
 *       409: { description: Slug already exists }
 *       403: { description: Requires tenant.manage }
 */
// POST /admin/tenants — create tenant
router.post('/', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { name, slug } = req.body as { name?: string; slug?: string };
    if (!name || !slug) {
      res.status(400).json({ success: false, error: { message: 'name and slug are required' } });
      return;
    }
    const slugNorm = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE slug = ?', [slugNorm]);
    if (existing) {
      res.status(409).json({ success: false, error: { message: 'A tenant with this slug already exists' } });
      return;
    }
    const id = uuidv4();
    execute(
      `INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`,
      [id, String(name).trim(), slugNorm]
    );
    const tenant = queryOne<{
      id: string; name: string; slug: string; status: string;
      created_at: string; updated_at: string;
    }>('SELECT * FROM tenants WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: tenant });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants/{id}:
 *   put:
 *     tags: [Tenants]
 *     summary: Update tenant
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
 *               name: { type: string }
 *               slug: { type: string }
 *               status: { type: string, enum: [active, suspended] }
 *     responses:
 *       200: { description: Tenant updated }
 *       404: { description: Tenant not found }
 *       403: { description: Requires tenant.manage }
 */
// PUT /admin/tenants/:id — update tenant
router.put('/:id', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    const { name, slug, status } = req.body as { name?: string; slug?: string; status?: string };
    if (slug) {
      const slugNorm = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      const dup = queryOne<{ id: string }>('SELECT id FROM tenants WHERE slug = ? AND id != ?', [slugNorm, id]);
      if (dup) {
        res.status(409).json({ success: false, error: { message: 'Slug already in use' } });
        return;
      }
      execute('UPDATE tenants SET slug = ?, updated_at = datetime(\'now\') WHERE id = ?', [slugNorm, id]);
    }
    if (name) {
      execute('UPDATE tenants SET name = ?, updated_at = datetime(\'now\') WHERE id = ?', [String(name).trim(), id]);
    }
    if (status && ['active', 'suspended'].includes(status)) {
      execute('UPDATE tenants SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
    }
    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [id]);
    res.json({ success: true, data: tenant });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants/{id}:
 *   delete:
 *     tags: [Tenants]
 *     summary: Delete tenant
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Tenant deleted }
 *       404: { description: Tenant not found }
 *       403: { description: Requires tenant.manage }
 */
// DELETE /admin/tenants/:id — delete tenant (courses get tenant_id = NULL via ON DELETE SET NULL)
router.delete('/:id', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    // Explicitly nullify course tenant_id before delete
    execute('UPDATE courses SET tenant_id = NULL WHERE tenant_id = ?', [id]);
    execute('DELETE FROM tenants WHERE id = ?', [id]);
    res.json({ success: true, message: 'Tenant deleted' });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants/{id}/users:
 *   get:
 *     tags: [Tenants]
 *     summary: List tenant users
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of users in the tenant }
 *       403: { description: Requires tenant.manage }
 */
// GET /admin/tenants/:id/users — list tenant users
router.get('/:id/users', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const users = query<{
      userId: string; name: string; email: string; tenantRole: string; joinedAt: string;
    }>(`
      SELECT tu.user_id AS userId, u.name, u.email, tu.tenant_role AS tenantRole, tu.joined_at AS joinedAt
      FROM tenant_users tu
      JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = ?
      ORDER BY tu.joined_at DESC
    `, [id]);
    res.json({ success: true, data: { users } });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants/{id}/users:
 *   post:
 *     tags: [Tenants]
 *     summary: Add user to tenant
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
 *             required: [userId]
 *             properties:
 *               userId: { type: string }
 *               tenantRole: { type: string, enum: [admin, lecturer, member] }
 *     responses:
 *       201: { description: User added to tenant }
 *       404: { description: Tenant or user not found }
 *       403: { description: Requires tenant.manage }
 */
// POST /admin/tenants/:id/users — add user to tenant
router.post('/:id/users', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const { userId, tenantRole } = req.body as { userId?: string; tenantRole?: string };
    if (!userId) {
      res.status(400).json({ success: false, error: { message: 'userId is required' } });
      return;
    }
    const tenant = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!tenant) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }
    const role = tenantRole && ['admin', 'lecturer', 'member'].includes(tenantRole) ? tenantRole : 'member';
    execute(
      `INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, tenant_role, joined_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [id, userId, role]
    );
    res.status(201).json({ success: true, message: 'User added to tenant' });
  } catch (error) { next(error); }
});

/**
 * @openapi
 * /admin/tenants/{id}/users/{userId}:
 *   delete:
 *     tags: [Tenants]
 *     summary: Remove user from tenant
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User removed from tenant }
 *       403: { description: Requires tenant.manage }
 */
// DELETE /admin/tenants/:id/users/:userId — remove user from tenant
router.delete('/:id/users/:userId', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id, userId } = req.params;
    execute('DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true, message: 'User removed from tenant' });
  } catch (error) { next(error); }
});

export default router;
