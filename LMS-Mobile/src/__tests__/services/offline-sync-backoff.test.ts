import {OfflineLearning, backoffDelay, type OfflinePackage, type OfflineStore, type SavedCourse} from '@/services/offlineLearning';

const serverTime = 100_000;
const pack: OfflinePackage = {
  leaseId: 'lease', contentVersion: 'version', issuedAt: serverTime, serverTime, expiresAt: serverTime + 60_000,
  course: {id: 'course', title: 'Course', sections: [{id: 's', title: 'Week', items: [{id: 'text', type: 'text', title: 'L', information: 'Read'}]}]},
  progress: [],
};

function fixture(retryAfter: number | null = null) {
  const rows = new Map<string, SavedCourse>();
  let clock = 0;
  const store: OfflineStore = {
    list: async () => [...rows.values()], get: async id => rows.get(id) ?? null,
    save: async course => { rows.set(course.pack.course.id, course); }, discard: async id => { rows.delete(id); },
    notice: async () => null, clock: async () => clock, setClock: async v => { clock = v; },
  };
  const timers: {run: () => void; ms: number}[] = [];
  const inspect = jest.fn(async () => pack);
  const submit = jest.fn(async (_t: string, _c: string, op: {itemId: string}) => ({itemId: op.itemId, completedAt: 'now', progressPct: 100, lastPositionS: null}));
  const learning = new OfflineLearning({
    open: async () => store, clear: async () => { rows.clear(); }, fingerprint: async t => t, id: () => 'op-' + Math.random(),
    now: () => serverTime + 1_000, download: async () => pack, inspect, submit, rejection: () => null,
    retryAfter: () => retryAfter, random: () => 0.5,
    setTimer: (run, ms) => { timers.push({run, ms}); return timers.length; }, clearTimer: () => undefined,
  });
  return {learning, timers, inspect, submit, pending: () => rows.get('course')?.pending.length ?? 0};
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it('caps exponential backoff with full jitter', () => {
  expect(backoffDelay(0, () => 0.999)).toBe(999);
  expect(backoffDelay(3, () => 0.5)).toBe(4_000);
  expect(backoffDelay(30, () => 0.999)).toBeLessThanOrEqual(300_000);
  expect(backoffDelay(5, () => 0)).toBe(0);
});

it('retries a failed background sync later with growing waits, then succeeds and stops', async () => {
  const f = fixture();
  await f.learning.setSession('token', true);
  await f.learning.download('course');
  f.submit.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
  await f.learning.queue('course', 'text', {kind: 'complete'});
  for (let i = 0; i < 10 && f.timers.length < 1; i++) await settle();
  expect(f.timers.map(t => t.ms)).toEqual([500]);
  f.timers[0].run();
  for (let i = 0; i < 10 && f.timers.length < 2; i++) await settle();
  expect(f.timers[1].ms).toBe(1_000);
  f.timers[1].run();
  for (let i = 0; i < 10 && f.pending() > 0; i++) await settle();
  expect(f.pending()).toBe(0);
  expect(f.timers).toHaveLength(2);
});

it('waits as long as the server asks when it says Retry-After', async () => {
  const f = fixture(30_000);
  await f.learning.setSession('token', true);
  await f.learning.download('course');
  f.submit.mockRejectedValueOnce(new Error('busy'));
  await f.learning.queue('course', 'text', {kind: 'complete'});
  for (let i = 0; i < 10 && f.timers.length < 1; i++) await settle();
  expect(f.timers[0].ms).toBe(30_000);
});
