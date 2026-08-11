import path from 'path';
import fs from 'fs';
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

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > GITHUB_ZIP_MAX_BYTES) {
    throw new AppError(
      `Repository ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));
  logger.info({ zipPath, size: arrayBuffer.byteLength }, 'GitHub ZIP downloaded');

  return zipPath;
}
