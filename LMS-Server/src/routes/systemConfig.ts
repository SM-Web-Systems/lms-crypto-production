import { Router, Response } from 'express';
import { query, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /system/config:
 *   get:
 *     tags: [System]
 *     summary: Read all system config entries
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Config entries }
 *       403: { description: Requires system.config }
 */
router.get(
  '/config',
  authenticate,
  requirePermission('system.config'),
  (_req: AuthRequest, res: Response) => {
    const rows = query<{ key: string; value: string; updated_at: string; updated_by: string | null }>(
      'SELECT key, value, updated_at, updated_by FROM system_config ORDER BY key',
    );
    res.json({ success: true, data: rows });
  },
);

/**
 * @openapi
 * /system/config:
 *   put:
 *     tags: [System]
 *     summary: Upsert system config entries
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entries]
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [key, value]
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 *     responses:
 *       200: { description: Config updated }
 *       400: { description: Invalid entries }
 *       403: { description: Requires system.config }
 */
router.put(
  '/config',
  authenticate,
  requirePermission('system.config'),
  (req: AuthRequest, res: Response) => {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'entries must be a non-empty array of {key, value}' },
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.key || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Each entry must have string key and value' },
        });
        return;
      }
    }

    const userId = req.user!.userId;
    for (const { key, value } of entries) {
      execute(
        `INSERT INTO system_config (key, value, updated_at, updated_by)
         VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [key, value, userId],
      );
    }

    res.json({ success: true, message: `${entries.length} config entries updated` });
  },
);

export default router;
