import type { LessonProgress } from './courseCompletionService';

export interface OfflineLesson {
  id: string;
  type: 'text';
  title: string;
  description?: string;
  information: string;
}

export interface LeaseStatus {
  leaseId: string;
  contentVersion: string;
  expiresAt: number;
  serverTime: number;
}

export interface OfflinePackage extends LeaseStatus {
  issuedAt: number;
  course: {id: string; title: string; sections: {id: string; title: string; items: OfflineLesson[]}[]};
  progress: LessonProgress[];
}

export type OfflineAction = {kind: 'complete'} | {kind: 'progress'; positionSeconds: number; progressPercent: number};
export type OfflineOperation = OfflineAction & {
  idempotencyKey: string;
  leaseId: string;
  contentVersion: string;
  itemId: string;
};

export interface SavedCourse {
  pack: OfflinePackage;
  deadline: number;
  pending: OfflineOperation[];
}

export interface OfflineStore {
  list(): Promise<SavedCourse[]>;
  get(courseId: string): Promise<SavedCourse | null>;
  save(course: SavedCourse, notice?: string): Promise<void>;
  discard(courseId: string, notice: string): Promise<void>;
  notice(): Promise<string | null>;
  clock(): Promise<number>;
  setClock(now: number): Promise<void>;
}

interface OfflineDependencies {
  open(scope: string, create: boolean, verified: boolean): Promise<OfflineStore | null>;
  clear(): Promise<void>;
  fingerprint(token: string): Promise<string>;
  id(): string;
  now(): number;
  download(token: string, courseId: string): Promise<OfflinePackage>;
  inspect(token: string, courseId: string, leaseId: string): Promise<LeaseStatus>;
  submit(token: string, courseId: string, operation: OfflineOperation): Promise<LessonProgress>;
  rejection(error: unknown): string | null;
  /** Server-requested wait (Retry-After on a 429), in ms, or null. */
  retryAfter?(error: unknown): number | null;
  random?(): number;
  setTimer?(run: () => void, ms: number): unknown;
  clearTimer?(timer: unknown): void;
}

const retryBaseMs = 1_000;
const retryCapMs = 5 * 60_000;
/** Exponential backoff with full jitter: a random wait up to min(cap, base * 2^attempt). */
export function backoffDelay(attempt: number, random: () => number = Math.random) {
  return Math.floor(random() * Math.min(retryCapMs, retryBaseMs * 2 ** Math.max(0, attempt)));
}

interface Session { token: string; verified: boolean }
const maxLease = 86_400_000;
const expired = 'Offline access expired. Reconnect and save the course again. Pending updates for this lease were discarded.';
const empty = {courses: [] as SavedCourse[], notice: null as string | null};

export class OfflineLearning {
  private session: Session | null | undefined;
  private serial: Promise<unknown> = Promise.resolve();
  private cleanupRequired = false;
  private syncing?: {session: Session; request: Promise<void>};
  private version = 0;
  private listeners = new Set<() => void>();
  private failures = 0;
  private retryTimer: unknown;

  constructor(private readonly deps: OfflineDependencies) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.version;

  private publish() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.serial.then(work);
    this.serial = operation.catch(() => undefined);
    return operation;
  }

  setSession(token: string | null, verified = false): Promise<boolean> {
    if (token && this.session?.token === token) {
      this.session.verified = verified;
      if (verified) this.syncInBackground();
      return Promise.resolve(true);
    }
    if (token === null && this.session === null && !this.cleanupRequired) return Promise.resolve(true);
    this.cleanupRequired ||= this.session != null || token === null;
    this.session = token ? {token, verified} : null;
    this.publish();
    const cleanup = this.serialize(() => this.clearPrevious()).then(() => true, () => false);
    if (!token) { this.cancelRetry(); this.failures = 0; }
    if (verified) void cleanup.then(ok => { if (ok) this.syncInBackground(); });
    return cleanup;
  }

  private async clearPrevious() {
    if (!this.cleanupRequired) return;
    await this.deps.clear();
    this.cleanupRequired = false;
  }

  private current(session: Session) {
    if (session !== this.session) throw new Error('Your session changed.');
  }

  private async store(session: Session, create = false) {
    this.current(session);
    await this.clearPrevious();
    const scope = await this.deps.fingerprint(session.token);
    this.current(session);
    const store = await this.deps.open(scope, create, session.verified);
    this.current(session);
    return store;
  }

  private async time(store: OfflineStore) {
    const now = this.deps.now();
    if (now < await store.clock()) throw new Error('The device clock moved backwards. Correct it to open saved lessons.');
    await store.setClock(now);
    return now;
  }

  private deadline(status: LeaseStatus, startedAt: number, now: number) {
    const remaining = status.expiresAt - status.serverTime;
    if (!Number.isSafeInteger(status.expiresAt) || !Number.isSafeInteger(status.serverTime)
      || remaining <= 0 || remaining > maxLease || now < startedAt) {
      throw new Error('This offline lease is unavailable.');
    }
    return startedAt + remaining;
  }

  view() {
    const session = this.session;
    if (!session) return Promise.resolve(empty);
    return this.serialize(async () => {
      const store = await this.store(session);
      if (!store) return empty;
      const now = await this.time(store);
      const courses: SavedCourse[] = [];
      for (const course of await store.list()) {
        if (course.deadline <= now) await store.discard(course.pack.course.id, expired);
        else courses.push(course);
      }
      const notice = await store.notice();
      this.current(session);
      return {courses, notice};
    });
  }

  async download(courseId: string) {
    const session = this.session;
    if (!session?.verified) throw new Error('Connect and verify your session to save a course.');
    const version = this.version;
    const startedAt = this.deps.now();
    const pack = await this.deps.download(session.token, courseId);
    this.current(session);
    if (pack.course.id !== courseId || !pack.course.sections.length || !pack.leaseId || !pack.contentVersion
      || pack.course.sections.some(section => section.items.some(item => item.type !== 'text' || !item.information))) {
      throw new Error('This course package is invalid.');
    }
    await this.serialize(async () => {
      const store = await this.store(session, true);
      if (!store) throw new Error('Encrypted offline storage is unavailable on this device.');
      const now = await this.time(store);
      const deadline = this.deadline(pack, startedAt, now);
      if (deadline <= now) throw new Error('This offline lease expired.');
      const prior = await store.get(courseId);
      if (prior && version !== this.version) throw new Error('Saved lessons changed during download. Try again.');
      if (prior?.pending.length && prior.deadline > now) {
        throw new Error('Sync pending updates before saving this course again.');
      }
      if (!prior && (await store.list()).length >= 8) throw new Error('Remove a saved course before adding another.');
      this.current(session);
      await store.save({pack, deadline, pending: []}, prior?.pending.length ? expired : undefined);
      this.current(session);
    });
    this.publish();
  }

  async queue(courseId: string, itemId: string, action: OfflineAction) {
    const session = this.session;
    if (!session) throw new Error('Your offline session is unavailable.');
    await this.serialize(async () => {
      const store = await this.store(session);
      const course = await store?.get(courseId);
      if (!store || !course || course.deadline <= await this.time(store)) throw new Error('This offline lease expired.');
      if (!course.pack.course.sections.some(section => section.items.some(item => item.id === itemId))) {
        throw new Error('This lesson is unavailable offline.');
      }
      if (course.pending.some(op => op.itemId === itemId && op.kind === 'complete')) return;
      if (course.pending.length >= 64) throw new Error('Sync pending updates before saving more progress.');
      const {leaseId, contentVersion} = course.pack;
      const operation = {...action, itemId, leaseId, contentVersion, idempotencyKey: this.deps.id()};
      this.current(session);
      await store.save({...course, pending: [...course.pending, operation]});
      this.current(session);
    });
    this.publish();
    if (session.verified) {
      const running = this.syncing?.request;
      void (running ?? Promise.resolve()).catch(() => undefined).then(() => {
        if (session === this.session && session.verified) this.syncInBackground();
      });
    }
  }

  async remove(courseId: string) {
    const session = this.session;
    if (!session) return;
    await this.serialize(async () => {
      const store = await this.store(session);
      if (!store) return;
      const course = await store.get(courseId);
      if (course?.pending.length && course.deadline > await this.time(store)) {
        throw new Error('Sync pending updates before removing this course.');
      }
      this.current(session);
      await store.discard(courseId, 'Saved course removed.');
      this.current(session);
    });
    this.publish();
  }

  /**
   * Sync without blocking the caller. When it fails (offline, server busy), retry later with exponential
   * backoff and full jitter, or after the server's Retry-After, so many phones reconnecting at once spread
   * their requests out instead of hammering the server.
   */
  syncInBackground(): void {
    const session = this.session;
    if (!session?.verified) return;
    this.cancelRetry();
    void this.sync().then(() => { this.failures = 0; }, (error) => {
      if (session !== this.session || !session.verified) return;
      const delay = this.deps.retryAfter?.(error) ?? backoffDelay(this.failures, this.deps.random);
      this.failures = Math.min(this.failures + 1, 20);
      const set = this.deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
      this.retryTimer = set(() => { this.retryTimer = undefined; this.syncInBackground(); }, Math.min(retryCapMs, Math.max(0, delay)));
    });
  }

  private cancelRetry() {
    if (this.retryTimer === undefined) return;
    (this.deps.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>)))(this.retryTimer);
    this.retryTimer = undefined;
  }

  sync(): Promise<void> {
    const session = this.session;
    if (!session) return Promise.resolve();
    if (this.syncing?.session === session) return this.syncing.request;
    const request = this.drain(session).finally(() => {
      if (this.syncing?.request === request) this.syncing = undefined;
    });
    this.syncing = {session, request};
    return request;
  }

  private async drain(session: Session) {
    const {courses} = await this.view();
    this.current(session);
    let firstFailure: {error: unknown} | undefined;
    for (const saved of courses) {
      this.current(session);
      const {course, leaseId, contentVersion} = saved.pack;
      try {
        const startedAt = this.deps.now();
        const lease = await this.deps.inspect(session.token, course.id, leaseId);
        this.current(session);
        if (lease.leaseId !== leaseId || lease.contentVersion !== contentVersion) {
          throw new Error('The server returned a different offline lease.');
        }
        const present = await this.update(session, saved, current => {
          const now = this.deps.now();
          const deadline = Math.min(current.deadline, this.deadline(lease, startedAt, now));
          return deadline > now ? {...current, deadline} : null;
        }, expired);
        if (!present) continue;
        for (const operation of saved.pending) {
          this.current(session);
          const progress = await this.deps.submit(session.token, course.id, operation);
          if (progress.itemId !== operation.itemId) throw new Error('The server returned a different lesson.');
          const applied = await this.update(session, saved, current => ({
            ...current,
            pack: {...current.pack, progress: [...current.pack.progress.filter(row => row.itemId !== progress.itemId), progress]},
            pending: current.pending.filter(row => row.idempotencyKey !== operation.idempotencyKey),
          }));
          if (!applied) break;
        }
      } catch (error) {
        this.current(session);
        const notice = this.deps.rejection(error);
        if (notice) await this.update(session, saved, () => null, notice);
        else firstFailure ??= {error};
      }
    }
    if (firstFailure) throw firstFailure.error;
  }

  private async update(
    session: Session, saved: SavedCourse, change: (current: SavedCourse) => SavedCourse | null, notice = '',
  ) {
    const result = await this.serialize(async () => {
      const store = await this.store(session);
      const id = saved.pack.course.id;
      const current = await store?.get(id);
      if (!store || !current || current.pack.leaseId !== saved.pack.leaseId) return undefined;
      const updated = change(current);
      this.current(session);
      if (updated) await store.save(updated);
      else await store.discard(id, notice);
      this.current(session);
      return updated;
    });
    if (result !== undefined) this.publish();
    return result != null;
  }
}
