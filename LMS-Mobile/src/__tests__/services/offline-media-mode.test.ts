import {OfflineLearning, type OfflineMediaFiles, type OfflinePackage, type OfflineStore, type SavedCourse} from '@/services/offlineLearning';
import {vaultOwner} from '@/services/offlineLearningNative';

jest.mock('@/services/offlineMedia', () => ({offlineMedia: {save: jest.fn(), retain: jest.fn(), clear: jest.fn()}}));

const day = 86_400_000;
const serverTime = 100_000;
const video = {id: 'video', type: 'video' as const, title: 'Intro video', fileUrl: 'https://cdn.example/v.mp4', youtubeId: 'SyK8hJVq3_Q'};
const text = {id: 'text', type: 'text' as const, title: 'Reading', information: 'Saved reading'};
const pack = (overrides: Partial<OfflinePackage> = {}, items: OfflinePackage['course']['sections'][0]['items'] = [text, video]): OfflinePackage => ({
  leaseId: 'lease', contentVersion: 'version', issuedAt: serverTime, serverTime, expiresAt: serverTime + 14 * day,
  course: {id: 'course', title: 'Course', sections: [{id: 's', title: 'Week', items}]}, progress: [], ...overrides,
});

function fixture(served: OfflinePackage = pack()) {
  const rows = new Map<string, SavedCourse>();
  let clock = 0;
  let scope: string | undefined;
  const store: OfflineStore = {
    list: async () => [...rows.values()], get: async id => rows.get(id) ?? null,
    save: async course => { rows.set(course.pack.course.id, course); },
    discard: async id => { rows.delete(id); }, notice: async () => null,
    clock: async () => clock, setClock: async value => { clock = value; },
  };
  const media = {save: jest.fn<Promise<void>, Parameters<OfflineMediaFiles["save"]>>(async () => undefined), retain: jest.fn<Promise<void>, [string[]]>(async () => undefined), clear: jest.fn<Promise<void>, []>(async () => undefined)};
  const clear = jest.fn(async () => { rows.clear(); scope = undefined; });
  const learning = new OfflineLearning({
    open: async (requested, create, verified) => {
      if (scope && scope !== requested && verified) await clear();
      if (!scope && create) scope = requested;
      return scope === requested ? store : null;
    },
    clear, fingerprint: async token => 'owner:' + token.split('#')[0], id: () => 'op', now: () => serverTime + 1_000,
    download: async () => served, inspect: async () => served, submit: async (_t, _c, op) => ({itemId: op.itemId, completedAt: null, progressPct: 50, lastPositionS: 10}),
    rejection: () => null, media,
  });
  return {learning, media, clear, rows};
}

it('saves video lessons with their file and downloads the files only in Offline mode', async () => {
  const f = fixture();
  await f.learning.setSession('a#1', true);
  await f.learning.download('course');
  expect(f.media.save).not.toHaveBeenCalled();
  const progress = jest.fn();
  await f.learning.download('course', {withMedia: true, onProgress: progress});
  expect(f.media.save).toHaveBeenCalledWith(expect.objectContaining({leaseId: 'lease'}), progress);
  const {courses} = await f.learning.view();
  expect(courses[0].pack.course.sections[0].items).toEqual([text, video]);
  expect(f.media.retain).toHaveBeenLastCalledWith(['course']);
  await f.learning.queue('course', 'video', {kind: 'progress', positionSeconds: 30, progressPercent: 50});
  expect(f.rows.get('course')?.pending).toHaveLength(1);
});

it('accepts a 14-day lease and refuses a longer one or a media file that is not https', async () => {
  const longer = fixture(pack({expiresAt: serverTime + 14 * day + 1}));
  await longer.learning.setSession('a#1', true);
  await expect(longer.learning.download('course')).rejects.toThrow('unavailable');
  const insecure = fixture(pack({}, [{...video, fileUrl: 'http://cdn.example/v.mp4'}]));
  await insecure.learning.setSession('a#1', true);
  await expect(insecure.learning.download('course')).rejects.toThrow('invalid');
});

it('keeps saved courses when the session expires and the same learner signs in again', async () => {
  const f = fixture();
  await f.learning.setSession('a#1', true);
  await f.learning.download('course', {withMedia: true});
  await f.learning.queue('course', 'text', {kind: 'complete'});
  f.learning.lock();
  expect((await f.learning.view()).courses).toEqual([]);
  // A new token for the same learner reopens the vault with the offline completion still queued.
  await f.learning.setSession('a#2', true);
  expect(f.clear).not.toHaveBeenCalled();
  expect(f.media.clear).not.toHaveBeenCalled();
  expect(f.rows.get('course')?.pending).toEqual([expect.objectContaining({kind: 'complete', itemId: 'text'})]);
});

it('erases saved courses and files when another account signs in or the learner signs out', async () => {
  const f = fixture();
  await f.learning.setSession('a#1', true);
  await f.learning.download('course', {withMedia: true});
  f.learning.lock();
  await f.learning.setSession('b#1', true);
  await f.learning.view();
  expect(f.clear).toHaveBeenCalled();
  expect(f.rows.size).toBe(0);
  await f.learning.setSession(null);
  expect(f.media.clear).toHaveBeenCalled();
});

it('picks the vault by the learner id inside the token, not the token itself', () => {
  const token = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
  expect(vaultOwner(token({userId: 'u-1', iat: 1}))).toBe('user:u-1');
  expect(vaultOwner(token({userId: 'u-1', iat: 2}))).toBe('user:u-1');
  expect(vaultOwner('not-a-jwt')).toBe('not-a-jwt');
});
