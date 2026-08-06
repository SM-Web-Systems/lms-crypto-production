import { Router } from 'express';
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
  getCategories,
} from '../controllers/documentsController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadDocument } from '../utils/fileUpload.js';

const router = Router();

// All document routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /documents/categories:
 *   get:
 *     tags: [Documents]
 *     summary: List document categories
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of categories }
 */
// GET /documents/categories - Get list of all categories (must be before /:id)
router.get('/categories', getCategories);

/**
 * @openapi
 * /documents:
 *   get:
 *     tags: [Documents]
 *     summary: List documents
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated document list }
 */
// GET /documents - Get all documents with pagination/filtering
router.get('/', getDocuments);

/**
 * @openapi
 * /documents/{id}:
 *   get:
 *     tags: [Documents]
 *     summary: Get single document
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Document data }
 *       404: { description: Not found }
 */
// GET /documents/:id - Get single document
router.get('/:id', getDocument);

/**
 * @openapi
 * /documents/{id}/download:
 *   get:
 *     tags: [Documents]
 *     summary: Download document file
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: File download }
 *       404: { description: Not found }
 */
// GET /documents/:id/download - Download document file
router.get('/:id/download', downloadDocument);

/**
 * @openapi
 * /documents:
 *   post:
 *     tags: [Documents]
 *     summary: Upload new document
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               title: { type: string }
 *               category: { type: string }
 *     responses:
 *       201: { description: Document created }
 *       403: { description: Requires document.manage }
 */
// POST /documents - Upload new document (admin only)
router.post('/', requirePermission('document.manage'), uploadDocument.single('file'), createDocument);

/**
 * @openapi
 * /documents/{id}:
 *   put:
 *     tags: [Documents]
 *     summary: Update document metadata
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Document updated }
 *       403: { description: Requires document.manage }
 */
// PUT /documents/:id - Update document metadata (admin only)
router.put('/:id', requirePermission('document.manage'), updateDocument);

/**
 * @openapi
 * /documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete document
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Document deleted }
 *       403: { description: Requires document.manage }
 */
// DELETE /documents/:id - Delete document (admin only)
router.delete('/:id', requirePermission('document.manage'), deleteDocument);

export default router;

