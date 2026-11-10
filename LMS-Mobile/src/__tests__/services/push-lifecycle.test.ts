import {createHash} from 'node:crypto';
import {PushLifecycle, type PushInstallation} from '@/services/pushLifecycle';

const installationId = 'a1111111-1111-4111-8111-111111111111';
const projectId = 'a2222222-2222-4222-8222-222222222222';
const notificationId = 'a3333333-3333-4333-8333-333333333333';
const oldToken = 'ExpoPushToken[old-device]';
const newToken = 'ExpoPushToken[new-device]';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

function fixture() {
  let value: string | null = null;
  const deps = {
    read: jest.fn(async () => value),
    write: jest.fn(async (data: string) => { value = data; }),
    createIdentity: jest.fn(async () => ({installationId, credential: 'b'.repeat(64)})),
    hash: async (data: string) => createHash('sha256').update(data).digest('hex'),
    configured: jest.fn<Promise<string | null>, [string]>(async () => projectId),
    permission: jest.fn<Promise<boolean>, [boolean]>(async () => true),
    expoToken: jest.fn(async (_projectId: string, nativeToken?: string) => nativeToken ?? oldToken),
    register: jest.fn(async (_jwt: string, _record: PushInstallation, _id: string, _token: string) => {
      if (!value) throw new Error('No durable installation before registration');
    }),
    unregister: jest.fn(async (_record: PushInstallation) => {}),
    stale: (error: unknown) => error === 'stale',
    dismiss: jest.fn(),
  };
  return {deps, stored: () => value && JSON.parse(value), create: () => new PushLifecycle<string>(deps)};
}

const payload = (generation: number) => ({notificationId, installationId, generation});

describe('push lifecycle on a shared device', () => {
  it('prompts only on opt-in and checks configuration before requesting permission or a token', async () => {
    const {deps, create} = fixture();
    const push = create();
    await push.setSession('owner-a', 'jwt-a');
    await push.resume();
    expect(deps.permission).not.toHaveBeenCalled();
    deps.configured.mockResolvedValueOnce(null);
    await push.enable();
    expect(push.getSnapshot().status).toBe('unavailable');
    expect(deps.permission).not.toHaveBeenCalled();
    deps.permission.mockResolvedValueOnce(false);
    await push.enable();
    expect(deps.permission).toHaveBeenCalledWith(true);
    expect(push.getSnapshot().status).toBe('denied');
    expect(deps.expoToken).not.toHaveBeenCalled();
  });

  it('resumes the same durable generation, deduplicates a cold tap, and invalidates old responses after rotation', async () => {
    const {deps, create, stored} = fixture();
    const first = create();
    await first.setSession('owner-a', 'jwt-a');
    await first.enable();
    expect(first.getSnapshot()).toMatchObject({status: 'on', enabled: true});
    expect(JSON.stringify(stored())).not.toMatch(/jwt-a|ExpoPushToken/);
    expect(await first.notification(payload(1), true)).toBe(notificationId);
    expect(await first.notification(payload(1), true)).toBeNull();

    const relaunched = create();
    await relaunched.setSession('owner-a', 'jwt-a');
    await relaunched.resume();
    expect(deps.permission).toHaveBeenLastCalledWith(false);
    expect(deps.register).toHaveBeenLastCalledWith('jwt-a', expect.objectContaining({generation: 1}), projectId, oldToken);
    expect(await relaunched.notification(payload(1), true)).toBeNull();
    await relaunched.rotate(newToken);
    expect(deps.register).toHaveBeenLastCalledWith('jwt-a', expect.objectContaining({generation: 2}), projectId, newToken);
    expect(await relaunched.notification(payload(1))).toBeNull();
    expect(await relaunched.notification(payload(2))).toBe(notificationId);
    expect(await relaunched.notification({...payload(2), installationId: 'other'})).toBeNull();
  });

  it('fences an in-flight registration during offline logout and replays cleanup before a new account opts in', async () => {
    const {deps, create, stored} = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    const mutations: string[] = [];
    let online = false;
    let remoteGeneration = 0;
    deps.register.mockImplementation(async (jwt, record) => {
      if (jwt === 'jwt-a') { started.resolve(); await release.promise; }
      if (record.generation < remoteGeneration) throw 'stale';
      remoteGeneration = record.generation;
      mutations.push(jwt + ':' + record.generation);
    });
    deps.unregister.mockImplementation(async record => {
      if (!online) throw new Error('offline');
      remoteGeneration = record.generation;
      mutations.push('off:' + record.generation);
    });
    const first = create();
    await first.setSession('owner-a', 'jwt-a');
    const oldRequest = first.enable();
    await started.promise;
    await first.setSession(null);
    expect(stored()).toMatchObject({generation: 2, binding: null, cleanup: true});
    expect(await first.notification(payload(1), true)).toBeNull();

    const relaunched = create();
    await relaunched.setSession('owner-b', 'jwt-b');
    await relaunched.resume();
    expect(deps.register).toHaveBeenCalledTimes(1);
    online = true;
    await relaunched.enable();
    release.resolve();
    await oldRequest;
    expect(mutations).toEqual(['off:2', 'jwt-b:3']);
    expect(stored()).toMatchObject({generation: 3, binding: {ownerId: 'owner-b'}, cleanup: false});
  });

  it('aborts a delayed permission flow when the account changes', async () => {
    const {deps, create} = fixture();
    const started = deferred<void>();
    const permission = deferred<boolean>();
    deps.permission.mockImplementationOnce(() => {
      started.resolve();
      return permission.promise;
    });
    const push = create();
    await push.setSession('owner-a', 'jwt-a');
    const setup = push.enable();
    await started.promise;
    await push.setSession('owner-b', 'jwt-b');
    permission.resolve(true);
    await setup;
    expect(deps.expoToken).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
    expect(push.getSnapshot().enabled).toBe(false);
  });

  it('withholds registration after failed secure persistence and retries an offline disable fence', async () => {
    const {deps, create, stored} = fixture();
    const push = create();
    await push.setSession('owner-a', 'jwt-a');
    deps.write.mockRejectedValueOnce(new Error('secure store full'));
    await push.enable();
    expect(deps.register).not.toHaveBeenCalled();
    expect(push.getSnapshot().status).toBe('error');
    await push.enable();
    deps.write.mockRejectedValueOnce(new Error('secure store unavailable'));
    await push.disable();
    expect(await push.notification(payload(1), true)).toBeNull();
    await push.resume();
    expect(stored()).toMatchObject({generation: 2, binding: null, cleanup: false});
    expect(deps.unregister).toHaveBeenCalledWith(expect.objectContaining({generation: 2}));
  });

  it('advances once when the server disabled a registration after a provider rejection', async () => {
    const {deps, create} = fixture();
    const push = create();
    await push.setSession('owner-a', 'jwt-a');
    await push.enable();
    deps.register.mockRejectedValueOnce('stale');
    await push.resume();
    expect(deps.register.mock.calls.map(([, record]) => record.generation)).toEqual([1, 1, 2]);
    expect(push.getSnapshot().status).toBe('on');
  });

  it('discards notification details fetched for a superseded session', async () => {
    const push = fixture().create();
    await push.setSession('owner-a', 'jwt-a');
    const response = deferred<string>();
    const get = jest.fn(() => response.promise);
    const result = push.withSession(get);
    await push.setSession('owner-b', 'jwt-b');
    response.resolve('Private notification');
    await expect(result).rejects.toThrow('session changed');
    expect(get).toHaveBeenCalledWith('jwt-a');
  });
});
