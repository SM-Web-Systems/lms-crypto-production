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

  it('ignores a hold file override outside tests', () => {
    const previous = process.env.VITEST;
    delete process.env.VITEST;
    const database = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = '/app/data/student_ms.db';
    expect(writerHoldFilePath()).toBe(path.resolve('/app/data/.writer-hold'));
    process.env.VITEST = previous;
    if (database === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = database;
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

  it('stays held when the expected hold directory is missing', () => {
    process.env.WRITER_HOLD_FILE = path.join(dir, 'missing', '.writer-hold');
    expect(isWriterHoldActive()).toBe(true);
  });

  it('stays held when parent-directory inspection fails', () => {
    const parent = dir;
    const original = fs.statSync;
    const spy = vi.spyOn(fs, 'statSync').mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
      if (String(file) === parent) throw Object.assign(new Error('Synthetic permission denial'), { code: 'EACCES' });
      return Reflect.apply(original, fs, [file, ...args]);
    }) as typeof fs.statSync);
    try { expect(isWriterHoldActive()).toBe(true); } finally { spy.mockRestore(); }
  });

  it('refuses HTTP mutations when the hold directory is missing', async () => {
    process.env.WRITER_HOLD_FILE = path.join(dir, 'missing', '.writer-hold');
    const response = await request(app).post('/api/v1/auth/login').send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('WRITER_HOLD');
  });

  it('detects a hold marker created while inspecting its directory', () => {
    const original = fs.statSync;
    const spy = vi.spyOn(fs, 'statSync').mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
      if (String(file) === dir) hold();
      return Reflect.apply(original, fs, [file, ...args]);
    }) as typeof fs.statSync);
    try { expect(isWriterHoldActive()).toBe(true); } finally { spy.mockRestore(); }
  });

  it('keeps worker startup paused until the missing directory is restored', () => {
    vi.useFakeTimers();
    const parent = path.join(dir, 'missing');
    process.env.WRITER_HOLD_FILE = path.join(parent, '.writer-hold');
    const start = vi.fn();
    runWhenWriterHoldReleased(start, 1000);
    vi.advanceTimersByTime(3000);
    expect(start).not.toHaveBeenCalled();
    fs.mkdirSync(parent);
    vi.advanceTimersByTime(1000);
    expect(start).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(start).toHaveBeenCalledTimes(1);
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

  it('keeps health and the credential-free authorization probe available', async () => {
    hold();
    for (const route of ['/health', '/api/v1/health']) {
      expect((await request(app).get(route)).status).toBe(200);
    }
    // /healthz probes with a real write, so the hold must refuse it
    expect((await request(app).get('/healthz')).status).toBe(503);
    expect((await request(app).get('/api/v1/courses')).status).toBe(401);
    expect((await request(app).post('/api/v1/courses').send({})).status).toBe(503);
  });

  it('permits only the parameter-free Wallet callback probe during the hold', async () => {
    hold();
    const callback = '/api/v1/auth/amma-callback';
    const probe = await request(app).get(callback);
    expect(probe.status).toBe(302);
    expect(probe.headers['referrer-policy']).toBe('no-referrer');
    expect(probe.headers['cache-control']).toBe('no-store');
    expect(new URL(probe.headers.location).searchParams.get('sso_error')).toBe('missing_params');

    for (const req of [
      request(app).get(callback).query({state: 'fixture', assertion: 'fixture'}),
      request(app).get(callback).set('Authorization', 'Bearer fixture'),
      request(app).get(callback).set('Cookie', 'session=fixture'),
      request(app).head(callback),
      request(app).post(callback).send({assertion: 'fixture'}),
    ]) {
      expect((await req).status).toBe(503);
    }
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
