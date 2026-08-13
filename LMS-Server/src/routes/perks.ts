/**
 * Perks Marketplace routes.
 *
 * Student-facing:
 *   GET  /perks             — browse available perks (requires perks.access)
 *   POST /perks/:id/claim   — claim a perk (requires perks.access, unique constraint)
 *
 * Admin-facing:
 *   GET    /admin/perks      — list all perks
 *   POST   /admin/perks      — create perk
 *   PUT    /admin/perks/:id  — update perk
 *   DELETE /admin/perks/:id  — delete perk
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

// ─── Student-facing routes ──────────────────────────────────────────────────

/**
 * @openapi
 * /perks:
 *   get:
 *     tags: [Perks]
 *     summary: Browse available perks
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Available perks }
 *       403: { description: Requires perks.access }
 */
router.get(
  '/',
  authenticate,
  requirePermission('perks.access'),
  (_req: AuthRequest, res: Response) => {
    const perks = query<{
      id: string; title: string; description: string | null;
      image_url: string | null; expires_at: string | null;
      max_claims: number | null; created_at: string;
      claim_count: number;
    }>(
      `SELECT p.id, p.title, p.description, p.image_url, p.expires_at,
              p.max_claims, p.created_at,
              (SELECT COUNT(*) FROM perk_claims pc WHERE pc.perk_id = p.id) as claim_count
       FROM perks p
       ORDER BY p.created_at DESC`,
    );
    res.json({ success: true, data: perks });
  },
);

/**
 * @openapi
 * /perks/{id}/claim:
 *   post:
 *     tags: [Perks]
 *     summary: Claim a perk
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Perk claimed }
 *       400: { description: Already claimed or expired }
 *       404: { description: Perk not found }
 */
router.post(
  '/:id/claim',
  authenticate,
  requirePermission('perks.access'),
  (req: AuthRequest, res: Response) => {
    const perkId = req.params.id;
    const userId = req.user!.userId;

    const perk = queryOne<{
      id: string; expires_at: string | null; max_claims: number | null;
    }>('SELECT id, expires_at, max_claims FROM perks WHERE id = ?', [perkId]);

    if (!perk) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }

    // Check expiry
    if (perk.expires_at && new Date(perk.expires_at) < new Date()) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Perk has expired' },
      });
      return;
    }

    // Check max claims
    if (perk.max_claims !== null) {
      const claimCount = queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM perk_claims WHERE perk_id = ?', [perkId],
      );
      if (claimCount && claimCount.cnt >= perk.max_claims) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Perk has reached maximum claims' },
        });
        return;
      }
    }

    // Check duplicate claim (unique constraint perk_id + user_id)
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM perk_claims WHERE perk_id = ? AND user_id = ?', [perkId, userId],
    );
    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.DUPLICATE_ENTRY, message: 'You have already claimed this perk' },
      });
      return;
    }

    const claimId = uuidv4();
    execute(
      'INSERT INTO perk_claims (id, perk_id, user_id) VALUES (?, ?, ?)',
      [claimId, perkId, userId],
    );

    res.status(201).json({ success: true, data: { id: claimId, perkId, userId } });
  },
);

// ─── Admin-facing routes ────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/perks:
 *   get:
 *     tags: [Perks]
 *     summary: List all perks (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All perks with claim counts }
 */
router.get(
  '/admin',
  authenticate,
  requirePermission('perks.access'),
  (_req: AuthRequest, res: Response) => {
    const perks = query<{
      id: string; title: string; description: string | null;
      image_url: string | null; expires_at: string | null;
      max_claims: number | null; created_by: string; created_at: string;
      claim_count: number;
    }>(
      `SELECT p.*, (SELECT COUNT(*) FROM perk_claims pc WHERE pc.perk_id = p.id) as claim_count
       FROM perks p ORDER BY p.created_at DESC`,
    );
    res.json({ success: true, data: perks });
  },
);

/**
 * @openapi
 * /admin/perks:
 *   post:
 *     tags: [Perks]
 *     summary: Create a perk (admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               image_url: { type: string }
 *               expires_at: { type: string }
 *               max_claims: { type: integer }
 *     responses:
 *       201: { description: Perk created }
 */
router.post(
  '/admin',
  authenticate,
  requirePermission('course.manage'),
  (req: AuthRequest, res: Response) => {
    const { title, description, image_url, expires_at, max_claims } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'title is required' },
      });
      return;
    }

    const id = uuidv4();
    execute(
      `INSERT INTO perks (id, title, description, image_url, expires_at, max_claims, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description ?? null, image_url ?? null, expires_at ?? null, max_claims ?? null, req.user!.userId],
    );

    res.status(201).json({ success: true, data: { id, title } });
  },
);

/**
 * @openapi
 * /admin/perks/{id}:
 *   put:
 *     tags: [Perks]
 *     summary: Update a perk (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Perk updated }
 *       404: { description: Perk not found }
 */
router.put(
  '/admin/:id',
  authenticate,
  requirePermission('course.manage'),
  (req: AuthRequest, res: Response) => {
    const perk = queryOne<{ id: string }>('SELECT id FROM perks WHERE id = ?', [req.params.id]);
    if (!perk) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }

    const { title, description, image_url, expires_at, max_claims } = req.body;
    if (title) execute('UPDATE perks SET title = ? WHERE id = ?', [title, req.params.id]);
    if (description !== undefined) execute('UPDATE perks SET description = ? WHERE id = ?', [description, req.params.id]);
    if (image_url !== undefined) execute('UPDATE perks SET image_url = ? WHERE id = ?', [image_url, req.params.id]);
    if (expires_at !== undefined) execute('UPDATE perks SET expires_at = ? WHERE id = ?', [expires_at, req.params.id]);
    if (max_claims !== undefined) execute('UPDATE perks SET max_claims = ? WHERE id = ?', [max_claims, req.params.id]);

    res.json({ success: true, data: { id: req.params.id } });
  },
);

/**
 * @openapi
 * /admin/perks/{id}:
 *   delete:
 *     tags: [Perks]
 *     summary: Delete a perk (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Perk deleted }
 *       404: { description: Perk not found }
 */
router.delete(
  '/admin/:id',
  authenticate,
  requirePermission('course.manage'),
  (req: AuthRequest, res: Response) => {
    const changes = execute('DELETE FROM perks WHERE id = ?', [req.params.id]);
    if (changes === 0) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }
    res.json({ success: true, message: 'Perk deleted' });
  },
);

export default router;
