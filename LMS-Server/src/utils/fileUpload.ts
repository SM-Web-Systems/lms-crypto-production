import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import logger from './logger.js';

dotenv.config();

// Use absolute path for uploads directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB default

// Allowed MIME types for submissions
const SUBMISSION_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
  'text/csv',
];

// Allowed MIME types for course documents (includes images and presentations)
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  // PowerPoint
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
];

// Extension map for MIME types
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': '.ppsx',
};

// Ensure upload directory exists
function ensureUploadDir(subdir: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = path.join(UPLOAD_DIR, subdir, String(year), month);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  return dir;
}

// Create storage configuration for a specific subdirectory
function createStorage(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = ensureUploadDir(subdir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = MIME_TO_EXTENSION[file.mimetype] || path.extname(file.originalname);
      const uniqueName = `${uuidv4()}${ext}`;
      cb(null, uniqueName);
    },
  });
}

// File filter for submissions
const submissionFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (SUBMISSION_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'Invalid file type. Allowed types: PDF, DOC, DOCX, XLSX, PPTX, ZIP, JPEG, PNG, GIF, TXT, CSV',
      400,
      ErrorCodes.INVALID_FILE_TYPE
    ));
  }
};

// File filter for course documents (includes images)
const documentFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(
      'Invalid file type. Allowed types: PDF, DOC, DOCX, ZIP, TXT, PNG, JPG, GIF, PPT, PPTX',
      400,
      ErrorCodes.INVALID_FILE_TYPE
    ));
  }
};

// Upload middleware for submissions
export const upload = multer({
  storage: createStorage('submissions'),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: submissionFileFilter,
});

// Upload middleware for course documents
export const uploadDocument = multer({
  storage: createStorage('documents'),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: documentFileFilter,
});

// File filter for ZIP imports — only application/zip
const zipFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype === 'application/zip') {
    cb(null, true);
  } else {
    cb(new AppError(
      'Only ZIP files are accepted',
      400,
      ErrorCodes.INVALID_FILE_TYPE
    ));
  }
};

// Upload middleware for ZIP course imports (50 MB max)
export const uploadZip = multer({
  storage: createStorage('imports'),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: zipFileFilter,
});

export function deleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error deleting file');
  }
}

export function getFileUrl(submissionId: string): string {
  return `/api/v1/submissions/${submissionId}/download`;
}

export function getDocumentFileUrl(documentId: string): string {
  return `/api/v1/documents/${documentId}/download`;
}

export function resolveUploadPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) {
    throw new AppError('Invalid file path', 403, ErrorCodes.FORBIDDEN);
  }
  return resolved;
}
