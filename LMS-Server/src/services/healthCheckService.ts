import { db } from '../config/database.js';
import fs from 'fs';
import path from 'path';

const BUILD_SHA_PATTERN = /^[0-9a-f]{7,64}$/;

export function validateBuildSha(raw: string | undefined): string {
  if (!raw || !BUILD_SHA_PATTERN.test(raw)) return 'unknown';
  return raw;
}

let _buildSha: string | undefined;
function getBuildSha(): string {
  if (_buildSha !== undefined) return _buildSha;
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'BUILD_SHA'), 'utf-8').trim();
    _buildSha = validateBuildSha(raw);
  } catch {
    _buildSha = 'unknown';
  }
  return _buildSha;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  buildSha: string;
  checks: {
    db: { status: 'ok' | 'error'; latencyMs: number };
    memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
    ammaWallet: { configured: boolean; network: string };
  };
}

export function getHealthStatus(): HealthStatus {
  let dbStatus: 'ok' | 'error' = 'ok';
  let dbLatency = 0;
  try {
    const start = Date.now();
    db.prepare('SELECT 1').get();
    dbLatency = Date.now() - start;
  } catch {
    dbStatus = 'error';
  }

  const mem = process.memoryUsage();

  return {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    buildSha: getBuildSha(),
    checks: {
      db: { status: dbStatus, latencyMs: dbLatency },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1048576),
        heapTotalMB: Math.round(mem.heapTotal / 1048576),
        rssMB: Math.round(mem.rss / 1048576),
      },
      ammaWallet: {
        configured: !!process.env.AMMA_WALLET_URL,
        network: process.env.AMMA_WALLET_NETWORK ?? 'testnet',
      },
    },
  };
}
