import { Router, Response } from 'express';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { execute, queryOne } from '../config/database.js';
import { AuthRequest } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { assembleExport } from '../services/dataExportService.js';

const router = Router();

// POST /data-export — request data export
router.post('/data-export', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  // Rate limit: 1 per 24h
  const recent = queryOne<{ id: string }>(
    "SELECT id FROM data_exports WHERE user_id = ? AND created_at > datetime('now', '-24 hours')",
    [userId],
  );
  if (recent) {
    res.status(429).json({ success: false, error: { message: 'Export rate limit: 1 per 24 hours' } });
    return;
  }

  const exportId = uuidv4();
  execute(
    'INSERT INTO data_exports (id, user_id) VALUES (?, ?)',
    [exportId, userId],
  );

  // Start async assembly
  assembleExport(exportId, userId);

  res.status(202).json({ success: true, data: { exportId, status: 'pending' } });
});

// GET /data-export/:id — poll status / download
router.get('/data-export/:id', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const exp = queryOne<{ status: string; file_path: string | null; error: string | null }>(
    'SELECT status, file_path, error FROM data_exports WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  if (!exp) {
    res.status(404).json({ success: false, error: { message: 'Export not found' } });
    return;
  }

  if (exp.status === 'ready' && exp.file_path && fs.existsSync(exp.file_path)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="data-export-${id}.zip"`);
    fs.createReadStream(exp.file_path).pipe(res);
    return;
  }

  res.json({ success: true, data: { status: exp.status, error: exp.error } });
});

export default router;
