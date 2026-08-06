import { Router } from 'express';
import { 
  getStudents, 
  getStudent, 
  createStudent, 
  updateStudent, 
  deleteStudent,
  importStudents,
} from '../controllers/studentsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// All student routes require admin authentication
router.use(authenticate);
router.use(requirePermission('user.view_all'));

/**
 * @openapi
 * /students:
 *   get:
 *     tags: [Students]
 *     summary: List all students (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated student list }
 *       403: { description: Requires user.view_all permission }
 */
// GET /students - Get all students with pagination/filtering
router.get('/', getStudents);

/**
 * @openapi
 * /students/{id}:
 *   get:
 *     tags: [Students]
 *     summary: Get single student
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student data }
 *       404: { description: Student not found }
 */
// GET /students/:id - Get single student
router.get('/:id', getStudent);

/**
 * @openapi
 * /students:
 *   post:
 *     tags: [Students]
 *     summary: Create new student
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201: { description: Student created }
 */
// POST /students - Create new student
router.post('/', createStudent);

/**
 * @openapi
 * /students/import:
 *   post:
 *     tags: [Students]
 *     summary: Bulk CSV import students
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [students]
 *             properties:
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     email: { type: string }
 *     responses:
 *       200: { description: Import results }
 */
// POST /students/import - Bulk CSV import
router.post('/import', importStudents);

/**
 * @openapi
 * /students/{id}:
 *   put:
 *     tags: [Students]
 *     summary: Update student
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student updated }
 */
// PUT /students/:id - Update student
router.put('/:id', updateStudent);

/**
 * @openapi
 * /students/{id}:
 *   delete:
 *     tags: [Students]
 *     summary: Delete student
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student deleted }
 */
// DELETE /students/:id - Delete student
router.delete('/:id', deleteStudent);

export default router;

