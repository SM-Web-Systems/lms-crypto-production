import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import app from '../app.js';
import {
  engageWriterHold,
  isWriterHoldActive,
  releaseWriterHold,
  runWhenWriterHoldReleased,
  writerHoldFilePath,
} from '../services/writerHold.js';

describe('AUTH-14 writer hold', () => {
  let dir: string;
  const hold = () => engageWriterHold();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writer-hold-'));
    process.env.WRITER_HOLD_FILE = path.join(dir, '.writer-hold');
  });

  afterEach(() => {
    delete process.env.WRITER_HOLD_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('defaults to the database directory so the hold follows the mounted volume', () => {
    delete process.env.WRITER_HOLD_FILE;
    const previous = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = '/app/data/student_ms.db';
    expect(writerHoldFilePath()).toBe(path.resolve('/app/data/.writer-hold'));
    if (previous === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous;
  });

  it('is inactive without the file and active with it', () => {
    expect(isWriterHoldActive()).toBe(false);
    hold();
    expect(isWriterHoldActive()).toBe(true);
    releaseWriterHold();
    expect(isWriterHoldActive()).toBe(false);
  });

  it('fails closed when the hold state cannot be read', () => {
    const blocker = path.join(dir, 'file');
    fs.writeFileSync(blocker, '');
    process.env.WRITER_HOLD_FILE = path.join(blocker, '.writer-hold');
    expect(isWriterHoldActive()).toBe(true);
  });

  it('refuses mutations and provider webhooks with a retryable 503', async () => {
    hold();
    const mutation = await request(app).post('/api/v1/auth/login').send({ email: 'a@example.test', password: 'x' });
    expect(mutation.status).toBe(503);
    expect(mutation.headers['retry-after']).toBeDefined();
    expect(mutation.body.error.code).toBe('WRITER_HOLD');
    const webhook = await request(app).post('/api/v1/webhooks/paystack').set('Content-Type', 'application/json').send('{}');
    expect(webhook.status).toBe(503);
    expect(webhook.body.error.code).toBe('WRITER_HOLD');
  });

  it('refuses authenticated and public reads, which may also write', async () => {
    hold();
    expect((await request(app).get('/api/v1/courses').set('Authorization', 'Bearer x')).status).toBe(503);
    expect((await request(app).get('/verify/anything')).status).toBe(503);
  });

  it('keeps only health and the credential-free authorization probe available', async () => {
    hold();
    for (const route of ['/health', '/healthz', '/api/v1/health']) {
      expect((await request(app).get(route)).status).toBe(200);
    }
    expect((await request(app).get('/api/v1/courses')).status).toBe(401);
    expect((await request(app).post('/api/v1/courses').send({})).status).toBe(503);
  });

  it('reports hold state on health for release verification', async () => {
    expect((await request(app).get('/api/v1/health')).body.writerHold.active).toBe(false);
    hold();
    expect((await request(app).get('/api/v1/health')).body.writerHold.active).toBe(true);
  });

  it('resumes requests after release without a restart', async () => {
    hold();
    expect((await request(app).post('/api/v1/auth/login').send({})).status).toBe(503);
    releaseWriterHold();
    expect((await request(app).post('/api/v1/auth/login').send({})).status).not.toBe(503);
  });

  it('starts workers immediately when no hold is active', () => {
    const start = vi.fn();
    runWhenWriterHoldReleased(start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('holds worker startup until release, then starts exactly once', () => {
    vi.useFakeTimers();
    hold();
    const start = vi.fn();
    runWhenWriterHoldReleased(start, 1000);
    vi.advanceTimersByTime(5000);
    expect(start).not.toHaveBeenCalled();
    releaseWriterHold();
    vi.advanceTimersByTime(1000);
    expect(start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
