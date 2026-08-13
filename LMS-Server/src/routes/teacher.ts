import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /teacher/dashboard — class stats overview
router.get('/teacher/dashboard', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const classes = query<{ id: string; name: string; member_count: number }>(
    `SELECT ug.id, ug.name,
       (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = ug.id) AS member_count
     FROM user_groups ug
     WHERE ug.owner_user_id = ? AND ug.group_type = 'class'`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      totalClasses: classes.length,
      totalStudents: classes.reduce((sum, c) => sum + c.member_count, 0),
      classes: classes.map(c => ({ id: c.id, name: c.name, studentCount: c.member_count })),
    },
  });
});

// GET /teacher/classes — list own classes
router.get('/teacher/classes', authenticate, requirePermission('group.manage'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const classes = query<{ id: string; name: string; created_at: string; member_count: number }>(
    `SELECT ug.id, ug.name, ug.created_at,
       (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = ug.id) AS member_count
     FROM user_groups ug
     WHERE ug.owner_user_id = ? AND ug.group_type = 'class'
     ORDER BY ug.created_at DESC`,
    [userId]
  );

  res.json({ success: true, data: { classes } });
});

// POST /teacher/classes — create class
router.post('/teacher/classes', authenticate, requirePermission('group.create'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ success: false, error: 'Class name is required' });
    return;
  }

  const id = uuidv4();
  execute(
    "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, 'class', ?)",
    [id, name.trim(), userId]
  );

  res.status(201).json({ success: true, data: { id, name: name.trim(), groupType: 'class' } });
});

// DELETE /teacher/classes/:id — delete own class
router.delete('/teacher/classes/:id', authenticate, requirePermission('group.manage'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;
  const { id } = req.params;

  const cls = queryOne<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM user_groups WHERE id = ? AND group_type = 'class'",
    [id]
  );
  if (!cls || cls.owner_user_id !== userId) {
    res.status(404).json({ success: false, error: 'Class not found' });
    return;
  }

  execute('DELETE FROM user_groups WHERE id = ?', [id]);
  res.json({ success: true });
});

// GET /teacher/classes/:id/students — list class members with progress
router.get('/teacher/classes/:id/students', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;
  const { id } = req.params;

  const cls = queryOne<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM user_groups WHERE id = ? AND group_type = 'class'",
    [id]
  );
  if (!cls || cls.owner_user_id !== userId) {
    res.status(404).json({ success: false, error: 'Class not found' });
    return;
  }

  const students = query<{ id: string; name: string; email: string; completed_lessons: number }>(
    `SELECT u.id, u.name, u.email,
       (SELECT COUNT(*) FROM lesson_completions lc WHERE lc.user_id = u.id AND lc.completed_at IS NOT NULL) AS completed_lessons
     FROM users u
     JOIN user_group_members ugm ON ugm.user_id = u.id
     WHERE ugm.group_id = ?`,
    [id]
  );

  res.json({ success: true, data: { students } });
});

// POST /teacher/classes/:id/invite — add existing student to class (by userId)
router.post('/teacher/classes/:id/invite', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;
  const { id } = req.params;
  const { userId: studentId } = req.body;

  if (!studentId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }

  const cls = queryOne<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM user_groups WHERE id = ? AND group_type = 'class'",
    [id]
  );
  if (!cls || cls.owner_user_id !== userId) {
    res.status(404).json({ success: false, error: 'Class not found' });
    return;
  }

  try {
    execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [id, studentId]);
  } catch {
    res.status(409).json({ success: false, error: 'Already in class' });
    return;
  }

  res.status(201).json({ success: true });
});

// GET /teacher/classes/:classId/students/:userId/login-history — scoped via class membership
router.get(
  '/teacher/classes/:classId/students/:userId/login-history',
  authenticate,
  requirePermission('student.login_history'),
  (req, res: Response) => {
    const teacherId = (req as AuthRequest).user!.userId;
    const { classId: groupId, userId: studentId } = req.params;

    // Verify teacher owns this class
    const group = queryOne<{ id: string }>(
      "SELECT id FROM user_groups WHERE id = ? AND owner_user_id = ? AND group_type = 'class'",
      [groupId, teacherId],
    );
    if (!group) {
      res.status(403).json({ success: false, error: { message: 'Not your class' } });
      return;
    }

    // Verify student is in this class
    const member = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, studentId],
    );
    if (!member) {
      res.status(403).json({ success: false, error: { message: 'Student not in this class' } });
      return;
    }

    const history = query<{ login_at: string; ip_address: string; auth_method: string }>(
      'SELECT login_at, ip_address, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
      [studentId],
    );
    res.json({ success: true, data: { history } });
  },
);

// GET /teacher/billing — own payment history
router.get('/teacher/billing', authenticate, requirePermission('billing.view_own'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const payments = query<{ id: string; amount_cents: number; currency: string; payment_method: string; status: string; created_at: string }>(
    'SELECT id, amount_cents, currency, payment_method, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  res.json({ success: true, data: { payments } });
});

// GET /teacher/analytics — class completion analytics
router.get('/teacher/analytics', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const analytics = query<{ class_name: string; total_students: number; completed: number }>(
    `SELECT ug.name AS class_name,
       COUNT(DISTINCT ugm.user_id) AS total_students,
       COUNT(DISTINCT CASE WHEN lc.completed_at IS NOT NULL THEN ugm.user_id END) AS completed
     FROM user_groups ug
     JOIN user_group_members ugm ON ugm.group_id = ug.id
     LEFT JOIN lesson_completions lc ON lc.user_id = ugm.user_id AND lc.completed_at IS NOT NULL
     WHERE ug.owner_user_id = ? AND ug.group_type = 'class'
     GROUP BY ug.id`,
    [userId]
  );

  res.json({ success: true, data: { analytics } });
});

export default router;
