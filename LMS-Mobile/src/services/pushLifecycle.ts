export interface PushInstallation {
  installationId: string;
  credential: string;
  generation: number;
}

interface Binding {
  ownerId: string;
  sessionHash: string;
  tokenHash: string;
  projectId: string;
}

interface InstallationRecord extends PushInstallation {
  binding: Binding | null;
  cleanup: boolean;
  opened: string[];
}

interface Session {
  ownerId: string;
  token: string;
  hash: Promise<string>;
}

type Status = 'off' | 'on' | 'pending' | 'denied' | 'unavailable' | 'error';
export interface PushSnapshot {
  status: Status;
  enabled: boolean;
  cleanupPending: boolean;
  revision: number;
}

export interface PushLifecycleDependencies<NativeToken> {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  createIdentity: () => Promise<Omit<PushInstallation, 'generation'>>;
  hash: (value: string) => Promise<string>;
  configured: (jwt: string) => Promise<string | null>;
  permission: (prompt: boolean) => Promise<boolean>;
  expoToken: (projectId: string, nativeToken?: NativeToken) => Promise<string>;
  register: (jwt: string, installation: PushInstallation, projectId: string, token: string) => Promise<void>;
  unregister: (installation: PushInstallation) => Promise<void>;
  stale: (error: unknown) => boolean;
  dismiss: () => void;
}

export const notificationIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hashPattern = /^[a-f0-9]{64}$/;
const expoTokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,200}\]$/;
const initialSnapshot: PushSnapshot = {status: 'off', enabled: false, cleanupPending: false, revision: 0};

function decodeRecord(raw: string | null): InstallationRecord | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as InstallationRecord | null;
  if (!value || typeof value.installationId !== 'string' || !notificationIdPattern.test(value.installationId)
    || typeof value.credential !== 'string' || !hashPattern.test(value.credential)
    || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.cleanup !== 'boolean'
    || !Array.isArray(value.opened) || value.opened.length > 12
    || value.opened.some(id => typeof id !== 'string' || !notificationIdPattern.test(id))) {
    throw new Error('Invalid push installation record');
  }
  const binding = value.binding;
  if (binding !== null && (!binding || value.cleanup || typeof binding.ownerId !== 'string'
    || typeof binding.sessionHash !== 'string' || !hashPattern.test(binding.sessionHash)
    || typeof binding.tokenHash !== 'string' || !hashPattern.test(binding.tokenHash)
    || typeof binding.projectId !== 'string' || !notificationIdPattern.test(binding.projectId))) {
    throw new Error('Invalid push binding record');
  }
  return value;
}

function nextGeneration(record: InstallationRecord): number {
  const next = record.generation + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Push installation generation exhausted');
  return next;
}

function credentials(record: InstallationRecord): PushInstallation {
  return {installationId: record.installationId, credential: record.credential, generation: record.generation};
}

export class PushLifecycle<NativeToken = never> {
  private session: Session | null | undefined;
  private revision = 0;
  private disableRequested = false;
  private needsSessionFence = false;
  private record: InstallationRecord | null | undefined;
  private storage: Promise<unknown> = Promise.resolve();
  private cleanupRequest?: {generation: number; result: Promise<boolean>};
  private syncRequest?: {revision: number; result: Promise<void>};
  private snapshot = initialSnapshot;
  private listeners = new Set<() => void>();

  constructor(private readonly deps: PushLifecycleDependencies<NativeToken>) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = () => this.snapshot;

  private publish(status: Status, enabled = this.snapshot.enabled) {
    this.snapshot = {status, enabled, cleanupPending: this.record?.cleanup ?? false, revision: this.revision};
    for (const listener of this.listeners) listener();
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.storage.then(work);
    this.storage = result.catch(() => undefined);
    return result;
  }

  private async load() {
    if (this.record === undefined) this.record = decodeRecord(await this.deps.read());
    return this.record;
  }

  private async save(record: InstallationRecord) {
    await this.deps.write(JSON.stringify(record));
    this.record = record;
    return record;
  }

  private async fence(record: InstallationRecord | null) {
    if (!record?.binding) return record;
    return this.save({...record, binding: null, generation: nextGeneration(record), cleanup: true, opened: []});
  }

  private prepare(revision: number, session: Session | null) {
    return this.serialize(async () => {
      const record = await this.load();
      const sessionHash = await session?.hash;
      if (revision !== this.revision) return null;
      const binding = record?.binding;
      const matches = binding && session && binding.ownerId === session.ownerId && binding.sessionHash === sessionHash;
      const shouldFence = !!binding && (!matches || this.needsSessionFence || this.disableRequested);
      if (shouldFence) this.deps.dismiss();
      const updated = shouldFence ? await this.fence(record) : record;
      if (revision === this.revision) this.needsSessionFence = false;
      return updated;
    });
  }

  private flushCleanup(record: InstallationRecord | null): Promise<boolean> {
    if (!record?.cleanup) return Promise.resolve(true);
    if (this.cleanupRequest?.generation === record.generation) return this.cleanupRequest.result;
    const result = (async () => {
      try {
        await this.deps.unregister(credentials(record));
        await this.serialize(async () => {
          if (this.record === record) await this.save({...record, cleanup: false});
        });
        return true;
      } catch {
        return false;
      }
    })();
    this.cleanupRequest = {generation: record.generation, result};
    void result.then(() => {
      if (this.cleanupRequest?.result === result) this.cleanupRequest = undefined;
      this.publish(this.snapshot.status);
    });
    return result;
  }

  setSession(ownerId: string | null, token?: string): Promise<boolean> {
    if (this.session?.ownerId === ownerId && this.session?.token === token
      || this.session === null && ownerId === null) return Promise.resolve(true);
    const previous = this.session;
    this.session = ownerId && token ? {ownerId, token, hash: this.deps.hash(token)} : null;
    const session = this.session;
    const revision = ++this.revision;
    this.disableRequested = false;
    this.needsSessionFence = previous !== undefined;
    this.publish('off', false);
    const prepared = this.prepare(revision, session).then(updated => {
      if (revision !== this.revision) return true;
      this.publish(updated?.binding ? 'pending' : 'off', !!updated?.binding);
      void this.flushCleanup(updated);
      return true;
    }).catch(() => {
      if (revision === this.revision) this.publish('error', false);
      return false;
    });
    void prepared.then(ok => {
      if (ok && revision === this.revision && this.snapshot.enabled) void this.resume();
    });
    return prepared;
  }

  disable = async () => {
    const revision = ++this.revision;
    this.disableRequested = true;
    this.publish('pending', false);
    try {
      const record = await this.prepare(revision, this.session ?? null);
      if (revision !== this.revision) return;
      this.publish('off', false);
      void this.flushCleanup(record);
    } catch {
      if (revision === this.revision) this.publish('error', true);
    }
  };

  enable = () => this.synchronize(true);
  resume = () => this.synchronize(false);
  rotate = (nativeToken: NativeToken) => this.synchronize(false, nativeToken);

  private synchronize(prompt: boolean, nativeToken?: NativeToken): Promise<void> {
    const revision = this.revision;
    const pending = this.syncRequest;
    if (pending?.revision === revision) {
      if (!prompt && !nativeToken) return pending.result;
      return pending.result.then(() => {
        if (revision === this.revision) return this.synchronize(prompt, nativeToken);
      });
    }
    const result = this.reconcile(revision, prompt, nativeToken).finally(() => {
      if (this.syncRequest?.result === result) this.syncRequest = undefined;
    });
    this.syncRequest = {revision, result};
    return result;
  }

  private async reconcile(revision: number, prompt: boolean, nativeToken?: NativeToken) {
    const current = () => revision === this.revision;
    const session = this.session;
    if (session === undefined) return;
    try {
      const record = await this.prepare(revision, session);
      if (!current()) return;
      if (!(await this.flushCleanup(record))) throw new Error('Pending push cleanup');
      if (!current()) return;
      if (!session || (!record?.binding && !prompt)) {
        this.publish('off', false);
        return;
      }
      const sessionHash = await session.hash;
      if (!current()) return;
      this.publish('pending', !!record?.binding);
      const projectId = await this.deps.configured(session.token);
      if (!current()) return;
      if (!projectId) { this.publish('unavailable'); return; }
      const permitted = await this.deps.permission(prompt);
      if (!current()) return;
      if (!permitted) {
        await this.disable();
        if (this.revision === revision + 1 && this.snapshot.status === 'off') this.publish('denied');
        return;
      }
      const token = await this.deps.expoToken(projectId, nativeToken);
      if (!current()) return;
      if (!expoTokenPattern.test(token)) throw new Error('Invalid Expo token');
      const tokenHash = await this.deps.hash(token);
      const binding: Binding = {ownerId: session.ownerId, sessionHash, tokenHash, projectId};
      const persist = (advance: boolean) => this.serialize(async () => {
        const stored = await this.load();
        if (!current() || stored?.cleanup) return null;
        if (!stored) {
          const identity = await this.deps.createIdentity();
          if (!current()) return null;
          return this.save({...identity, generation: 1, binding, cleanup: false, opened: []});
        }
        const previous = stored.binding;
        if (!advance && previous?.ownerId === binding.ownerId && previous.sessionHash === binding.sessionHash
          && previous.tokenHash === binding.tokenHash && previous.projectId === binding.projectId) return stored;
        return this.save({...stored, generation: nextGeneration(stored), binding});
      });
      let active = await persist(false);
      if (!active || !current()) return;
      this.disableRequested = false;
      this.publish('pending', true);
      try {
        await this.deps.register(session.token, credentials(active), projectId, token);
      } catch (error) {
        if (!current() || !this.deps.stale(error)) throw error;
        active = await persist(true);
        if (!active || !current()) return;
        await this.deps.register(session.token, credentials(active), projectId, token);
      }
      if (current()) this.publish('on', true);
    } catch {
      if (current()) this.publish('error');
    }
  }

  async notification(data: unknown, consume = false): Promise<string | null> {
    const revision = this.revision;
    const session = this.session;
    if (!session || this.disableRequested || this.needsSessionFence || !data || typeof data !== 'object') return null;
    const payload = data as {notificationId?: unknown; installationId?: unknown; generation?: unknown};
    const id = payload.notificationId;
    if (typeof id !== 'string' || !notificationIdPattern.test(id)) return null;
    try {
      return await this.serialize(async () => {
        const record = await this.load();
        const hash = await session.hash;
        if (revision !== this.revision || !record?.binding || record.binding.ownerId !== session.ownerId
          || record.binding.sessionHash !== hash || record.installationId !== payload.installationId
          || record.generation !== payload.generation) return null;
        if (consume) {
          if (record.opened.includes(id)) return null;
          await this.save({...record, opened: [...record.opened.slice(-11), id]});
        }
        return revision === this.revision ? id : null;
      });
    } catch {
      return null;
    }
  }

  async withSession<T>(work: (jwt: string) => Promise<T>): Promise<T> {
    const session = this.session;
    if (!session) throw new Error('Sign in to view this notification.');
    const result = await work(session.token);
    if (session !== this.session) throw new Error('Your session changed.');
    return result;
  }
}
