import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /parent/dashboard — linked children count + progress overview
router.get('/parent/dashboard', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const children = query<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM users u
     JOIN user_links ul ON ul.child_user_id = u.id
     WHERE ul.parent_user_id = ? AND ul.link_type = 'parent'`,
    [userId]
  );

  res.json({
    success: true,
    data: { childrenCount: children.length, children },
  });
});

// GET /parent/children — list linked students
router.get('/parent/children', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const children = query<{ id: string; name: string; email: string; created_at: string }>(
    `SELECT u.id, u.name, u.email, u.created_at FROM users u
     JOIN user_links ul ON ul.child_user_id = u.id
     WHERE ul.parent_user_id = ? AND ul.link_type = 'parent'`,
    [userId]
  );

  res.json({ success: true, data: { children } });
});

// POST /parent/children — create + link student account
router.post('/parent/children', authenticate, requirePermission('user.create'), (req, res: Response) => {
  const { userId: parentId } = (req as AuthRequest).user!;
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ success: false, error: 'name, email, and password are required' });
    return;
  }

  // Check duplicate email
  const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    res.status(409).json({ success: false, error: 'Email already in use' });
    return;
  }

  const childId = uuidv4();
  const hash = bcrypt.hashSync(password, 10);

  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')",
    [childId, name, email, hash]
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [childId, 'role_student']);

  // Create student record
  const studentId = uuidv4();
  const enrollmentNumber = `REG-${childId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  execute(
    "INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester) VALUES (?, ?, ?, ?, ?, 'General', 1)",
    [studentId, childId, name, email, enrollmentNumber]
  );

  // Link parent → child
  execute(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
    [uuidv4(), parentId, childId]
  );

  res.status(201).json({ success: true, data: { id: childId, name, email } });
});

// GET /parent/children/:id/progress — view child's progress (scoped to linked children)
router.get('/parent/children/:id/progress', authenticate, requirePermission('student.view_assigned'), (req, res: Response) => {
  const { userId: parentId } = (req as AuthRequest).user!;
  const { id: childId } = req.params;

  // Verify link
  const link = queryOne(
    "SELECT id FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'",
    [parentId, childId]
  );
  if (!link) {
    res.status(403).json({ success: false, error: 'Not linked to this student' });
    return;
  }

  const progress = query<{ course_id: string; item_id: string; progress_pct: number; completed_at: string | null }>(
    'SELECT course_id, item_id, progress_pct, completed_at FROM lesson_completions WHERE user_id = ?',
    [childId]
  );

  res.json({ success: true, data: { progress } });
});

// GET /parent/children/:id/login-history — view child's login history (scoped)
router.get('/parent/children/:id/login-history', authenticate, requirePermission('student.login_history'), (req, res: Response) => {
  const { userId: parentId } = (req as AuthRequest).user!;
  const { id: childId } = req.params;

  const link = queryOne(
    "SELECT id FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'",
    [parentId, childId]
  );
  if (!link) {
    res.status(403).json({ success: false, error: 'Not linked to this student' });
    return;
  }

  const history = query<{ login_at: string; ip_address: string; auth_method: string }>(
    'SELECT login_at, ip_address, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
    [childId]
  );

  res.json({ success: true, data: { history } });
});

// GET /parent/wallets — view linked student wallets
router.get('/parent/wallets', authenticate, requirePermission('student_wallet.read_assigned'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const wallets = query<{ id: string; name: string; walletAddress: string | null; reward_balance: number }>(
    `SELECT u.id, u.name, u.walletAddress, u.reward_balance FROM users u
     JOIN user_links ul ON ul.child_user_id = u.id
     WHERE ul.parent_user_id = ? AND ul.link_type = 'parent'`,
    [userId]
  );

  res.json({ success: true, data: { wallets } });
});

// GET /parent/billing — own payments
router.get('/parent/billing', authenticate, requirePermission('billing.view_own'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const payments = query<{ id: string; amount_cents: number; currency: string; payment_method: string; status: string; created_at: string }>(
    'SELECT id, amount_cents, currency, payment_method, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  res.json({ success: true, data: { payments } });
});

// GET /parent/groups — list family groups
router.get('/parent/groups', authenticate, requirePermission('group.manage'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;

  const groups = query<{ id: string; name: string; member_count: number }>(
    `SELECT ug.id, ug.name,
       (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = ug.id) AS member_count
     FROM user_groups ug
     WHERE ug.owner_user_id = ? AND ug.group_type = 'family'`,
    [userId]
  );

  res.json({ success: true, data: { groups } });
});

// POST /parent/groups — create family group
router.post('/parent/groups', authenticate, requirePermission('group.create'), (req, res: Response) => {
  const { userId } = (req as AuthRequest).user!;
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ success: false, error: 'Group name is required' });
    return;
  }

  const id = uuidv4();
  execute(
    "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, 'family', ?)",
    [id, name.trim(), userId]
  );

  res.status(201).json({ success: true, data: { id, name: name.trim(), groupType: 'family' } });
});

// POST /parent/groups/:id/members — add member (must be linked child)
router.post('/parent/groups/:id/members', authenticate, requirePermission('group.manage'), (req, res: Response) => {
  const { userId: parentId } = (req as AuthRequest).user!;
  const { id } = req.params;
  const { userId: memberId } = req.body;

  if (!memberId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }

  const group = queryOne<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM user_groups WHERE id = ? AND group_type = 'family'",
    [id]
  );
  if (!group || group.owner_user_id !== parentId) {
    res.status(404).json({ success: false, error: 'Group not found' });
    return;
  }

  // Must be linked child
  const link = queryOne(
    "SELECT id FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'",
    [parentId, memberId]
  );
  if (!link) {
    res.status(403).json({ success: false, error: 'Can only add linked children to family group' });
    return;
  }

  try {
    execute('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)', [id, memberId]);
  } catch {
    res.status(409).json({ success: false, error: 'Already a member' });
    return;
  }

  res.status(201).json({ success: true });
});

// DELETE /parent/groups/:id/members/:userId — remove member
router.delete('/parent/groups/:id/members/:userId', authenticate, requirePermission('group.manage'), (req, res: Response) => {
  const parentId = (req as AuthRequest).user!.userId;
  const { id, userId: memberId } = req.params;

  const group = queryOne<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM user_groups WHERE id = ? AND group_type = 'family'",
    [id]
  );
  if (!group || group.owner_user_id !== parentId) {
    res.status(404).json({ success: false, error: 'Group not found' });
    return;
  }

  execute('DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?', [id, memberId]);
  res.json({ success: true });
});

export default router;
