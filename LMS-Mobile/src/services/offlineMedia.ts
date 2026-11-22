import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { OfflineMediaFiles, OfflineMediaLesson, OfflinePackage } from './offlineLearning';
import { isStorageFull, STORAGE_FULL_MESSAGE } from '../utils/storageErrors';

/**
 * Video and audio files saved for Offline mode. They live in the app's private documents folder (not the
 * encrypted lesson vault: they are large, and they are the same public course files learners can download).
 * YouTube stays the player whenever the learner is online; these files are only the offline fallback.
 */
const root = () => `${FileSystem.documentDirectory ?? ''}lms-offline-media/`;
const hash = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
/** Leave room on the phone for photos, updates and the app itself. */
export const MIN_FREE_BYTES = 500 * 1024 * 1024;

const extension = (url: string, type: OfflineMediaLesson['type']) => {
  const match = new URL(url).pathname.match(/\.(mp4|m4v|webm|mov|mp3|m4a|aac|ogg|oga|wav)$/i);
  return match ? match[1].toLowerCase() : type === 'video' ? 'mp4' : 'mp3';
};
const mediaLessons = (pack: OfflinePackage) => pack.course.sections.flatMap(section => section.items)
  .filter((item): item is OfflineMediaLesson => item.type === 'video' || item.type === 'audio');

async function courseDir(courseId: string) { return `${root()}${await hash(courseId)}/`; }
async function filePath(courseId: string, item: OfflineMediaLesson) {
  return `${await courseDir(courseId)}${await hash(item.id)}.${extension(item.fileUrl, item.type)}`;
}

async function info(path: string) {
  try { return await FileSystem.getInfoAsync(path); } catch { return { exists: false as const }; }
}

export const offlineMedia: OfflineMediaFiles & {
  localUri(courseId: string, itemId: string): Promise<string | null>;
  courseBytes(courseId: string): Promise<number>;
  totalBytes(): Promise<number>;
} = {
  async save(pack, onProgress) {
    const items = mediaLessons(pack);
    if (!items.length) return;
    const dir = await courseDir(pack.course.id);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    let done = 0;
    onProgress?.(done, items.length);
    for (const item of items) {
      const target = await filePath(pack.course.id, item);
      if (!(await info(target)).exists) {
        const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
        if (free < MIN_FREE_BYTES) throw new Error(STORAGE_FULL_MESSAGE);
        const partial = `${target}.part`;
        try {
          const result = await FileSystem.downloadAsync(item.fileUrl, partial);
          if (result.status < 200 || result.status >= 300) throw new Error(`Could not download "${item.title}". Try again on Wi-Fi.`);
          await FileSystem.moveAsync({ from: partial, to: target });
        } catch (error) {
          await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => undefined);
          if (isStorageFull(error)) throw new Error(STORAGE_FULL_MESSAGE);
          throw error instanceof Error && error.message.startsWith('Could not download') ? error
            : new Error(`Could not download "${item.title}". Check your connection and try again.`);
        }
      }
      onProgress?.(++done, items.length);
    }
  },
  async retain(courseIds) {
    const keep = new Set(await Promise.all(courseIds.map(hash)));
    let names: string[] = [];
    try { names = await FileSystem.readDirectoryAsync(root()); } catch { return; }
    await Promise.all(names.filter(name => !keep.has(name))
      .map(name => FileSystem.deleteAsync(`${root()}${name}`, { idempotent: true }).catch(() => undefined)));
  },
  async clear() {
    await FileSystem.deleteAsync(root(), { idempotent: true });
  },
  async localUri(courseId, itemId) {
    const dir = await courseDir(courseId);
    const prefix = `${await hash(itemId)}.`;
    let names: string[] = [];
    try { names = await FileSystem.readDirectoryAsync(dir); } catch { return null; }
    const name = names.find(entry => entry.startsWith(prefix) && !entry.endsWith('.part'));
    return name ? dir + name : null;
  },
  async courseBytes(courseId) {
    const dir = await courseDir(courseId);
    let names: string[] = [];
    try { names = await FileSystem.readDirectoryAsync(dir); } catch { return 0; }
    let total = 0;
    for (const name of names) {
      const entry = await info(dir + name);
      if (entry.exists && 'size' in entry && typeof entry.size === 'number' && !name.endsWith('.part')) total += entry.size;
    }
    return total;
  },
  async totalBytes() {
    let names: string[] = [];
    try { names = await FileSystem.readDirectoryAsync(root()); } catch { return 0; }
    let total = 0;
    for (const name of names) {
      const dir = `${root()}${name}/`;
      let files: string[] = [];
      try { files = await FileSystem.readDirectoryAsync(dir); } catch { continue; }
      for (const file of files) {
        const entry = await info(dir + file);
        if (entry.exists && 'size' in entry && typeof entry.size === 'number' && !file.endsWith('.part')) total += entry.size;
      }
    }
    return total;
  },
};

/** "12.5 MB" style size for storage labels. */
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
