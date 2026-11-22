import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Online mode (default): lessons stream from YouTube and the server, and only text lessons are saved, so the
 * app uses little storage. Offline mode: saving a course also downloads its video and audio files, so the
 * learner can review everything without a connection. YouTube stays the player whenever the phone is online.
 */
export type LearningMode = 'online' | 'offline';
const key = 'lms.learning-mode.v1';
const listeners = new Set<(mode: LearningMode) => void>();
let cached: LearningMode | null = null;

export async function getLearningMode(): Promise<LearningMode> {
  if (cached) return cached;
  try { cached = (await AsyncStorage.getItem(key)) === 'offline' ? 'offline' : 'online'; }
  catch { cached = 'online'; }
  return cached;
}

export async function setLearningMode(mode: LearningMode) {
  cached = mode;
  for (const listener of listeners) listener(mode);
  try { await AsyncStorage.setItem(key, mode); } catch { /* the choice still applies until the app restarts */ }
}

export function useLearningMode(): [LearningMode, (mode: LearningMode) => Promise<void>] {
  const [mode, setMode] = useState<LearningMode>(cached ?? 'online');
  useEffect(() => {
    let active = true;
    void getLearningMode().then(value => { if (active) setMode(value); });
    listeners.add(setMode);
    return () => { active = false; listeners.delete(setMode); };
  }, []);
  return [mode, setLearningMode];
}
