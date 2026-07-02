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
import { authenticate, authorize } from '../middleware/auth.js';
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
router.post('/', authorize('admin'), uploadDocument.single('file'), createDocument);

// PUT /documents/:id - Update document metadata (admin only)
router.put('/:id', authorize('admin'), updateDocument);

// DELETE /documents/:id - Delete document (admin only)
router.delete('/:id', authorize('admin'), deleteDocument);

export default router;

