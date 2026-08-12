import path from 'path';
import fs from 'fs';
import { Readable, Transform, type TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import logger from '../utils/logger.js';

const GITHUB_ZIP_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Parse a GitHub repository URL into owner and repo.
 * Accepts: https://github.com/owner/repo, https://github.com/owner/repo.git,
 * and https://github.com/owner/repo/ (trailing slash).
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid URL format', 400, ErrorCodes.VALIDATION_ERROR);
  }

  if (parsed.hostname !== 'github.com') {
    throw new AppError('Only GitHub URLs are supported', 400, ErrorCodes.VALIDATION_ERROR);
  }

  const parts = parsed.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/');

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new AppError(
      'Invalid GitHub URL — expected https://github.com/owner/repo',
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

/**
 * Check if a GitHub org/user is in the allowed list.
 * Default: sm-web-systems. Override via GITHUB_IMPORT_ALLOWED_ORGS env (comma-separated).
 */
export function isAllowedOrg(owner: string): boolean {
  const envOrgs = process.env.GITHUB_IMPORT_ALLOWED_ORGS;
  const allowedList = envOrgs
    ? envOrgs
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : ['sm-web-systems'];
  return allowedList.includes(owner.toLowerCase());
}

/**
 * Download a public GitHub repository as a ZIP file.
 * Uses the GitHub zipball API (follows 302 redirects to S3).
 * Enforces a 50 MB size limit.
 * Returns the absolute path to the downloaded ZIP.
 */
export async function fetchGitHubZip(
  owner: string,
  repo: string,
  ref: string = 'main',
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(ref)}`;

  logger.info({ owner, repo, ref }, 'Fetching GitHub repository ZIP');

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LMS-AmmaWallet-Import/1.0',
    },
    redirect: 'follow',
  });

  if (response.status === 404) {
    throw new AppError('Repository not found or not public', 404, ErrorCodes.NOT_FOUND);
  }

  if (response.status === 403) {
    throw new AppError(
      'GitHub API rate limit exceeded — try again later',
      429,
      'RATE_LIMITED',
    );
  }

  if (!response.ok) {
    throw new AppError(
      `GitHub API error: ${response.status} ${response.statusText}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
    );
  }

  // Check Content-Length header if available before downloading
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > GITHUB_ZIP_MAX_BYTES) {
    throw new AppError(
      `Repository ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  // Stream to temp file with size enforcement
  const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  const now = new Date();
  const importDir = path.join(
    uploadDir,
    'imports',
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
  );
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
  }

  const zipPath = path.join(importDir, `${uuidv4()}.zip`);

  // Stream response body to disk with size enforcement (avoids buffering full ZIP in heap)
  if (!response.body) {
    throw new AppError('Empty response body from GitHub', 502, 'EXTERNAL_SERVICE_ERROR');
  }

  const sizeChecker = new SizeLimitTransform(GITHUB_ZIP_MAX_BYTES);
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  const fileStream = fs.createWriteStream(zipPath);

  try {
    await pipeline(nodeStream, sizeChecker, fileStream);
  } catch (err) {
    // Clean up partial file on failure
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    throw err;
  }

  const stat = fs.statSync(zipPath);
  logger.info({ zipPath, size: stat.size }, 'GitHub ZIP downloaded');

  return zipPath;
}

/**
 * Transform stream that enforces a byte size limit.
 * Throws AppError if cumulative bytes exceed maxBytes.
 */
export class SizeLimitTransform extends Transform {
  private bytesRead = 0;
  constructor(private maxBytes: number) {
    super();
  }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maxBytes) {
      callback(
        new AppError(
          `Repository ZIP exceeds ${this.maxBytes / 1024 / 1024}MB limit`,
          400,
          ErrorCodes.VALIDATION_ERROR,
        ),
      );
    } else {
      callback(null, chunk);
    }
  }
}
