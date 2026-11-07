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
  save(course: SavedCourse): Promise<void>;
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
      if (verified) void this.sync().catch(() => undefined);
      return Promise.resolve(true);
    }
    if (token === null && this.session === null && !this.cleanupRequired) return Promise.resolve(true);
    this.cleanupRequired ||= this.session != null || token === null;
    this.session = token ? {token, verified} : null;
    this.publish();
    const cleanup = this.serialize(() => this.clearPrevious()).then(() => true, () => false);
    if (verified) void cleanup.then(ok => { if (ok) void this.sync().catch(() => undefined); });
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
    const deadline = startedAt + remaining;
    if (deadline <= now) throw new Error('This offline lease expired.');
    return deadline;
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
      const prior = await store.get(courseId);
      if (prior && version !== this.version) throw new Error('Saved lessons changed during download. Try again.');
      if (prior?.pending.length && prior.deadline > now) {
        throw new Error('Sync pending updates before saving this course again.');
      }
      if (!prior && (await store.list()).length >= 8) throw new Error('Remove a saved course before adding another.');
      this.current(session);
      if (prior?.pending.length) await store.discard(courseId, expired);
      this.current(session);
      await store.save({pack, deadline, pending: []});
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
      void (running ? running.then(() => {
        if (session === this.session && session.verified) return this.sync();
      }) : this.sync()).catch(() => undefined);
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
    for (const saved of courses) {
      const {course, leaseId, contentVersion} = saved.pack;
      try {
        const startedAt = this.deps.now();
        const lease = await this.deps.inspect(session.token, course.id, leaseId);
        this.current(session);
        if (lease.leaseId !== leaseId || lease.contentVersion !== contentVersion) {
          throw new Error('The server returned a different offline lease.');
        }
        const present = await this.update(session, saved, current => ({
          ...current, deadline: Math.min(current.deadline, this.deadline(lease, startedAt, this.deps.now())),
        }));
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
        const notice = this.deps.rejection(error);
        if (!notice) throw error;
        await this.update(session, saved, () => null, notice);
      }
    }
  }

  private async update(
    session: Session, saved: SavedCourse, change: (current: SavedCourse) => SavedCourse | null, notice = '',
  ) {
    const changed = await this.serialize(async () => {
      const store = await this.store(session);
      const id = saved.pack.course.id;
      const current = await store?.get(id);
      if (!store || !current || current.pack.leaseId !== saved.pack.leaseId) return false;
      const updated = change(current);
      this.current(session);
      if (updated) await store.save(updated);
      else await store.discard(id, notice);
      this.current(session);
      return true;
    });
    if (changed) this.publish();
    return changed;
  }
}
