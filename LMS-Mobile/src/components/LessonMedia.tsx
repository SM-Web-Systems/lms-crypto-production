import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button } from './ui/Button';
import { ErrorBanner } from './ErrorBanner';

export interface LessonMediaProps {
  url: string;
  initialPosition?: number;
  onProgress: (position: number, percent: number) => void;
  onComplete: () => void;
}

function usePlaybackCallbacks(props: LessonMediaProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const latest = useRef({ position: 0, duration: 0 });
  const lastSave = useRef(0);
  const finished = useRef(false);
  const report = (position: number, duration: number, force = false) => {
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
    latest.current = { position, duration };
    if (!force && Date.now() - lastSave.current < 10_000) return;
    lastSave.current = Date.now();
    callbacks.current.onProgress(Math.floor(position), Math.min(100, Math.floor(position / duration * 100)));
  };
  const complete = () => {
    if (finished.current) return;
    finished.current = true;
    report(latest.current.duration, latest.current.duration, true);
    callbacks.current.onComplete();
  };
  const save = () => report(latest.current.position, latest.current.duration, true);
  const current = useRef({ report, complete, save });
  current.current = { report, complete, save };
  return current;
}

export function LessonVideo(props: LessonMediaProps) {
  const initial = useRef(props.initialPosition ?? 0);
  const callbacks = usePlaybackCallbacks(props);
  const [error, setError] = useState<string | null>(null);
  const player = useVideoPlayer(props.url, (player) => { player.loop = false; player.timeUpdateEventInterval = 1; });
  useEffect(() => {
    let restored = false;
    const restore = () => {
      if (restored || player.duration <= 0) return;
      restored = true;
      player.currentTime = Math.min(initial.current, Math.max(0, player.duration - 1));
    };
    restore();
    const subscriptions = [
      player.addListener('sourceLoad', restore),
      player.addListener('statusChange', ({ status }) => { if (status === 'error') setError('Could not play this video. Reopen the lesson to retry.'); if (status === 'readyToPlay') restore(); }),
      player.addListener('timeUpdate', ({ currentTime }) => { if (restored) callbacks.current.report(currentTime, player.duration); }),
      player.addListener('playingChange', ({ isPlaying }) => { if (!isPlaying && restored) callbacks.current.report(player.currentTime, player.duration, true); }),
      player.addListener('playToEnd', () => { callbacks.current.report(player.duration, player.duration, true); callbacks.current.complete(); }),
    ];
    const app = AppState.addEventListener('change', (state) => { if (state !== 'active') { player.pause(); callbacks.current.save(); } });
    return () => { callbacks.current.save(); subscriptions.forEach((subscription) => subscription.remove()); app.remove(); };
  }, [player, callbacks]);
  return <View className="gap-2">
    <VideoView player={player} style={{ width: '100%', height: 220, borderRadius: 12 }} contentFit="contain" nativeControls />
    {error ? <ErrorBanner message={error} /> : null}
  </View>;
}

export function LessonAudio(props: LessonMediaProps) {
  const initial = useRef(props.initialPosition ?? 0);
  const restored = useRef(false);
  const seekSettled = useRef(false);
  const awaitingResumeCursor = useRef(initial.current > 0);
  const callbacks = usePlaybackCallbacks(props);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(props.url, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    if (!status.isLoaded || restored.current) return;
    restored.current = true;
    if (initial.current > 0) {
      void player.seekTo(Math.min(initial.current, Math.max(0, status.duration - 1)))
        .then(() => { seekSettled.current = true; })
        .catch(() => { seekSettled.current = true; awaitingResumeCursor.current = false; setError('Could not restore playback position.'); });
    } else seekSettled.current = true;
  }, [player, status.isLoaded, status.duration]);
  useEffect(() => {
    if (!status.isLoaded || !seekSettled.current) return;
    // Ignore the pre-seek status snapshot: opening a lesson must not overwrite its saved cursor with zero.
    if (awaitingResumeCursor.current) {
      const target = Math.min(initial.current, Math.max(0, status.duration - 1));
      if (!status.didJustFinish && status.currentTime < target - 1) return;
      awaitingResumeCursor.current = false;
    }
    callbacks.current.report(status.currentTime, status.duration, !status.playing);
    if (status.didJustFinish) callbacks.current.complete();
  }, [status.currentTime, status.duration, status.playing, status.isLoaded, status.didJustFinish, callbacks]);
  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => { if (state !== 'active') { player.pause(); callbacks.current.save(); } });
    return () => { callbacks.current.save(); app.remove(); };
  }, [player, callbacks]);
  const seek = (offset: number) => { void player.seekTo(Math.max(0, Math.min(status.duration, status.currentTime + offset))).catch(() => setError('Could not seek the audio.')); };
  return <View className="gap-3 rounded-xl border border-neutral-200 p-4">
    <Text>{Math.floor(status.currentTime)} / {Math.floor(status.duration)} seconds</Text>
    <Button label={status.playing ? 'Pause audio' : 'Play audio'} disabled={!status.isLoaded} onPress={() => {
      try { if (status.playing) player.pause(); else player.play(); } catch { setError('Could not play the audio.'); }
    }} />
    <View className="flex-row gap-2">
      <View className="flex-1"><Button label="Back 15 seconds" variant="outline" disabled={!status.isLoaded} onPress={() => seek(-15)} /></View>
      <View className="flex-1"><Button label="Forward 15 seconds" variant="outline" disabled={!status.isLoaded} onPress={() => seek(15)} /></View>
    </View>
    {!status.isLoaded ? <Text>Loading audio…</Text> : null}
    {error || status.playbackState === 'error' ? <ErrorBanner message={error || 'Could not load this audio. Reopen the lesson to retry.'} /> : null}
  </View>;
}
