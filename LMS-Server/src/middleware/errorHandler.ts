import { Request, Response, NextFunction } from 'express';
import { ErrorCodes } from '../types/index.js';
import logger from '../utils/logger.js';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // LMS-ERR-001: Operational errors → warn without stack; unexpected → error with stack
  if (err instanceof AppError) {
    logger.warn({ requestId, statusCode: err.statusCode, code: err.code }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details,
      },
    });
    return;
  }

  // Handle Multer errors — LMS-ERR-002: read actual configured limit
  if (err.message === 'File too large' || (err as Error & { code?: string }).code === 'LIMIT_FILE_SIZE') {
    const maxMb = Math.round(parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) / 1048576);
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.FILE_TOO_LARGE,
        message: `File size exceeds maximum limit of ${maxMb}MB`,
        requestId,
      },
    });
    return;
  }

  // LMS-ERR-003: Never leak SQLite internals — always generic message
  logger.error({ requestId, err }, 'Unexpected error');
  const isSqlite = (err as Error & { code?: string }).code?.startsWith('SQLITE_');
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: (isSqlite || process.env.NODE_ENV === 'production')
        ? 'An unexpected error occurred'
        : err.message,
      requestId,
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: 'Resource not found',
      requestId: req.requestId,
    },
  });
}
