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

// GET /documents/categories - Get list of all categories (must be before /:id)
router.get('/categories', getCategories);

// GET /documents - Get all documents with pagination/filtering
router.get('/', getDocuments);

// GET /documents/:id - Get single document
router.get('/:id', getDocument);

// GET /documents/:id/download - Download document file
router.get('/:id/download', downloadDocument);

// POST /documents - Upload new document (admin only)
router.post('/', requirePermission('document.manage'), uploadDocument.single('file'), createDocument);

// PUT /documents/:id - Update document metadata (admin only)
router.put('/:id', requirePermission('document.manage'), updateDocument);

// DELETE /documents/:id - Delete document (admin only)
router.delete('/:id', requirePermission('document.manage'), deleteDocument);

export default router;

