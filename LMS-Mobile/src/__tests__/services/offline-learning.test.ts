import {OfflineLearning, type OfflineOperation, type OfflinePackage, type OfflineStore, type SavedCourse} from '@/services/offlineLearning';

const lesson = {id: 'text', type: 'text' as const, title: 'Lesson', information: 'Saved private reading'};
const serverTime = 100_000;
const pack: OfflinePackage = {
  leaseId: 'lease', contentVersion: 'version', issuedAt: serverTime, serverTime, expiresAt: serverTime + 60_000,
  course: {id: 'course', title: 'Course', sections: [{id: 's', title: 'Week', items: [lesson]}]},
  progress: [],
};

function fixture() {
  const rows = new Map<string, SavedCourse>();
  let lastClock = 0;
  let now = serverTime + 3_000;
  let scope: string | undefined;
  let notice: string | null = null;
  const store: OfflineStore = {
    list: async () => [...rows.values()],
    get: async id => rows.get(id) ?? null,
    save: async course => { rows.set(course.pack.course.id, course); },
    discard: async (id, reason) => { rows.delete(id); notice = reason; },
    notice: async () => notice,
    clock: async () => lastClock,
    setClock: async value => { lastClock = value; },
  };
  const write = jest.spyOn(store, 'save');
  let sequence = 0;
  const submit = jest.fn(async (_token: string, _id: string, operation: OfflineOperation) => ({
    itemId: operation.itemId, completedAt: '2026-11-07 00:00:00', progressPct: 100, lastPositionS: null,
  }));
  const inspect = jest.fn(async (_token: string, _id: string, _lease: string) => pack);
  const clear = jest.fn(async () => { rows.clear(); scope = undefined; notice = null; lastClock = 0; });
  const deps = {
    open: async (requested: string, create: boolean, verified: boolean) => {
      if (scope && scope !== requested && verified) await clear();
      if (!scope && create) scope = requested;
      return scope === requested ? store : null;
    },
    clear, fingerprint: async (token: string) => 'digest:' + token, id: () => 'operation-' + ++sequence,
    now: () => now, download: async () => pack, inspect, submit,
    rejection: (error: unknown) => error === 'revoked' ? 'Access withdrawn.' : null,
  };
  return {create: () => new OfflineLearning(deps), write, submit, inspect, clear, setTime: (value: number) => { now = value; }};
}

it('restores a pending completion after process death and retries the exact operation after a lost acknowledgment', async () => {
  const f = fixture();
  const first = f.create();
  await first.setSession('learner-a', true);
  await first.download('course');
  await first.setSession('learner-a');
  await first.queue('course', 'text', {kind: 'complete'});
  expect(f.submit).not.toHaveBeenCalled();

  const relaunched = f.create();
  await relaunched.setSession('learner-a');
  const [saved] = (await relaunched.view()).courses;
  const [queued] = saved.pending;
  expect(queued).toMatchObject({kind: 'complete', contentVersion: 'version', leaseId: 'lease'});
  expect(saved.pack.progress).toEqual([]);
  f.submit.mockRejectedValueOnce(new Error('The response was lost.'));
  await expect(relaunched.sync()).rejects.toThrow('response was lost');
  expect((await relaunched.view()).courses[0].pending).toEqual([queued]);
  await relaunched.sync();
  expect(f.submit.mock.calls).toEqual([['learner-a', 'course', queued], ['learner-a', 'course', queued]]);
  const [synced] = (await relaunched.view()).courses;
  expect(synced.pending).toEqual([]);
  expect(synced.pack.progress[0]).toMatchObject({completedAt: expect.any(String), progressPct: 100});
});

it('withdraws cached content and discards queued work when a lease is denied on reconnect', async () => {
  const f = fixture();
  const reader = f.create();
  await reader.setSession('learner-a', true);
  await reader.download('course');
  await reader.setSession('learner-a');
  await reader.queue('course', 'text', {kind: 'complete'});
  f.inspect.mockRejectedValueOnce('revoked');
  await reader.sync();
  expect(await reader.view()).toEqual({courses: [], notice: 'Access withdrawn.'});
  expect(f.submit).not.toHaveBeenCalled();
});

it('revalidates a saved course on reconnect even when the queue is empty', async () => {
  const f = fixture();
  const reader = f.create();
  await reader.setSession('learner-a', true);
  await reader.download('course');
  f.inspect.mockRejectedValueOnce('revoked');
  await reader.sync();
  expect(await reader.view()).toEqual({courses: [], notice: 'Access withdrawn.'});
});

it('hides saved content across a cold account mismatch and erases the previous vault on logout', async () => {
  const f = fixture();
  const first = f.create();
  await first.setSession('learner-a', true);
  await first.download('course');
  const other = f.create();
  await other.setSession('learner-b');
  expect((await other.view()).courses).toEqual([]);
  await first.setSession(null);
  const restored = f.create();
  await restored.setSession('learner-a');
  expect((await restored.view()).courses).toEqual([]);
  expect(f.clear).toHaveBeenCalledTimes(1);
});

it('drops a late acknowledgment after account switch without writing into the new vault', async () => {
  const f = fixture();
  const reader = f.create();
  await reader.setSession('learner-a', true);
  await reader.download('course');
  await reader.setSession('learner-a');
  await reader.queue('course', 'text', {kind: 'complete'});
  let start!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  let answer!: () => void;
  f.submit.mockImplementationOnce(() => new Promise(resolve => {
    answer = () => resolve({itemId: 'text', completedAt: 'date', progressPct: 100, lastPositionS: null});
    start();
  }));
  const sync = reader.sync();
  await started;
  await reader.setSession('learner-b', true);
  answer();
  await expect(sync).rejects.toThrow('session changed');
  expect((await reader.view()).courses).toEqual([]);
});

it('hides expired content and rejects a device clock rollback across restart', async () => {
  const f = fixture();
  const first = f.create();
  await first.setSession('learner-a', true);
  await first.download('course');
  f.setTime(serverTime + 2_000);
  const restarted = f.create();
  await restarted.setSession('learner-a');
  await expect(restarted.view()).rejects.toThrow('clock moved backwards');
  f.setTime(serverTime + 64_000);
  expect(await restarted.view()).toEqual({courses: [], notice: expect.stringContaining('Offline access expired')});
  await expect(restarted.queue('course', 'text', {kind: 'complete'})).rejects.toThrow('expired');
});

it('preserves the queue and displays no completion when a local update cannot be saved', async () => {
  const f = fixture();
  const reader = f.create();
  await reader.setSession('learner-a', true);
  await reader.download('course');
  await reader.setSession('learner-a');
  f.write.mockRejectedValueOnce(new Error('Storage is full.'));
  await expect(reader.queue('course', 'text', {kind: 'complete'})).rejects.toThrow('Storage is full');
  expect((await reader.view()).courses[0]).toMatchObject({pending: [], pack: {progress: []}});
  expect(f.submit).not.toHaveBeenCalled();
});
