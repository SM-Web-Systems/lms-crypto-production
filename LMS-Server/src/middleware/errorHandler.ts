import { Request, Response, NextFunction } from 'express';
import { ErrorCodes } from '../types/index.js';

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
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // LMS-ERR-001: Operational errors → warn without stack; unexpected → error with stack
  if (err instanceof AppError) {
    console.warn(`AppError ${err.statusCode} ${err.code}: ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
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
      },
    });
    return;
  }

  // LMS-ERR-003: Never leak SQLite internals — always generic message
  console.error('Unexpected error:', err);
  const isSqlite = (err as Error & { code?: string }).code?.startsWith('SQLITE_');
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: (isSqlite || process.env.NODE_ENV === 'production')
        ? 'An unexpected error occurred'
        : err.message,
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: 'Resource not found',
    },
  });
}

