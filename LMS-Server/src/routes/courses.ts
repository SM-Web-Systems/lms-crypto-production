import { Router } from 'express';
import {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  importCourseContent,
  importZipContent,
  getCourseMembers,
  addCourseMember,
  removeCourseMember,
  getLecturers,
  addLecturer,
  removeLecturer,
} from '../controllers/coursesController.js';
import { getCourseSubmissions } from '../controllers/submissionsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadZip } from '../utils/fileUpload.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /courses:
 *   get:
 *     tags: [Courses]
 *     summary: List courses
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of courses }
 */
router.get('/', getCourses);
/**
 * @openapi
 * /courses/{id}/members:
 *   get:
 *     tags: [Courses]
 *     summary: Get course members
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of course members }
 */
router.get('/:id/members', getCourseMembers);
/**
 * @openapi
 * /courses/{id}/members:
 *   post:
 *     tags: [Courses]
 *     summary: Enroll member in course
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
 *     responses:
 *       201: { description: Member enrolled }
 *       403: { description: Requires course.enroll_others }
 */
router.post('/:id/members', requirePermission('course.enroll_others'), addCourseMember);
/**
 * @openapi
 * /courses/{id}/members/{userId}:
 *   delete:
 *     tags: [Courses]
 *     summary: Remove member from course
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
 *       200: { description: Member removed }
 */
router.delete('/:id/members/:userId', requirePermission('course.enroll_others'), removeCourseMember);
// Phase 1 Course-Centric IA: submissions scoped to a course
/**
 * @openapi
 * /courses/{courseId}/submissions:
 *   get:
 *     tags: [Courses]
 *     summary: Get submissions for a course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Course submissions }
 */
router.get('/:courseId/submissions', getCourseSubmissions);
// Lecturer assignment — Phase C (registered before /:id to avoid param collision)
/**
 * @openapi
 * /courses/{id}/lecturers:
 *   get:
 *     tags: [Courses]
 *     summary: List assigned lecturers
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of lecturers }
 *       403: { description: Requires user.manage }
 */
router.get('/:id/lecturers', requirePermission('user.manage'), getLecturers);
/**
 * @openapi
 * /courses/{id}/lecturers:
 *   post:
 *     tags: [Courses]
 *     summary: Assign lecturer to course
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
 *     responses:
 *       201: { description: Lecturer assigned }
 */
router.post('/:id/lecturers', requirePermission('user.manage'), addLecturer);
/**
 * @openapi
 * /courses/{id}/lecturers/{lecturerUserId}:
 *   delete:
 *     tags: [Courses]
 *     summary: Remove lecturer from course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: lecturerUserId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lecturer removed }
 */
router.delete('/:id/lecturers/:lecturerUserId', requirePermission('user.manage'), removeLecturer);
/**
 * @openapi
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get single course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Course data }
 *       404: { description: Course not found }
 */
router.get('/:id', getCourse);
/**
 * @openapi
 * /courses:
 *   post:
 *     tags: [Courses]
 *     summary: Create course
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
 *     responses:
 *       201: { description: Course created }
 *       403: { description: Requires course.create }
 */
router.post('/', requirePermission('course.create'), createCourse);
/**
 * @openapi
 * /courses/{id}:
 *   put:
 *     tags: [Courses]
 *     summary: Update course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Course updated }
 *       403: { description: Requires course.manage }
 */
router.put('/:id', requirePermission('course.manage'), updateCourse);
/**
 * @openapi
 * /courses/{id}/import:
 *   post:
 *     tags: [Courses]
 *     summary: Import sections into an existing course
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
 *             required: [sections]
 *             properties:
 *               mode: { type: string, enum: [append, replace], description: "append (default) or replace existing sections" }
 *               sections:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [title]
 *                   properties:
 *                     title: { type: string }
 *                     objective: { type: string }
 *                     outcome: { type: string }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [type, title]
 *                         properties:
 *                           type: { type: string, enum: [video, link, pdf, text, audio, quiz, assignment, download] }
 *                           title: { type: string }
 *                           url: { type: string }
 *                           quizId: { type: string }
 *                           fileName: { type: string }
 *     responses:
 *       200: { description: Import result with sectionsImported, itemsImported, and updated course }
 *       400: { description: Validation errors }
 *       403: { description: Requires course.manage }
 *       404: { description: Course not found }
 */
router.post('/:id/import', requirePermission('course.manage'), importCourseContent);
/**
 * @openapi
 * /courses/{id}/import/zip:
 *   post:
 *     tags: [Courses]
 *     summary: Upload ZIP to preview course import
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [zipfile]
 *             properties:
 *               zipfile: { type: string, format: binary }
 *     responses:
 *       200: { description: Preview of extracted course structure }
 *       400: { description: Invalid ZIP or no extractable files }
 *       403: { description: Requires course.manage }
 *       404: { description: Course not found }
 */
router.post('/:id/import/zip', requirePermission('course.manage'), uploadZip.single('zipfile'), importZipContent);
/**
 * @openapi
 * /courses/{id}:
 *   delete:
 *     tags: [Courses]
 *     summary: Delete course
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Course deleted }
 *       403: { description: Requires course.manage }
 */
router.delete('/:id', requirePermission('course.manage'), deleteCourse);

export default router;
