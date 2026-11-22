import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {AppState, Linking, ScrollView, Text, View} from 'react-native';
import {offlineLearning, supportsOfflineLearning} from '@/services/offlineLearningNative';
import {formatBytes, offlineMedia} from '@/services/offlineMedia';
import {useLearningMode} from '@/services/learningMode';
import {createPlayTracker, flushPendingPlays, lessonContentService} from '@/services/lessonContentService';
import type {OfflineMediaLesson} from '@/services/offlineLearning';
import {LessonAudio, LessonVideo} from './LessonMedia';
import {getErrorMessage} from '@/utils/apiError';
import {isStorageFull, STORAGE_FULL_MESSAGE} from '@/utils/storageErrors';
import {Button} from './ui/Button';
import {Card, CardTitle} from './ui/Card';
import {LessonReading, isHtmlContent} from './LessonReading';

export function OfflineLearningPanel({courseId}: {courseId?: string}) {
  return supportsOfflineLearning ? <SavedLessons courseId={courseId} /> : null;
}

function SavedLessons({courseId}: {courseId?: string}) {
  const revision = useSyncExternalStore(offlineLearning.subscribe, offlineLearning.getSnapshot, offlineLearning.getSnapshot);
  const [open, setOpen] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{courseId: string; itemId: string} | null>(null);
  const [readingPercent, setReadingPercent] = useState(0);
  const [view, setView] = useState<{revision: number; data: Awaited<ReturnType<typeof offlineLearning.view>>} | null>(null);
  const [mode, setMode] = useLearningMode();
  const [download, setDownload] = useState<{done: number; total: number} | null>(null);
  const [mediaBytes, setMediaBytes] = useState(0);

  useEffect(() => {
    let active = true;
    void offlineMedia.totalBytes().then(bytes => { if (active) setMediaBytes(bytes); }).catch(() => undefined);
    return () => { active = false; };
  }, [revision, mode]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      const started = ++request;
      clearTimeout(timer);
      const current = () => !stopped && started === request && revision === offlineLearning.getSnapshot();
      void offlineLearning.view().then(data => {
        if (!current()) return;
        setView({revision, data});
        setLoadingError(null);
        if (data.courses.length) {
          const next = Math.min(...data.courses.map(course => course.deadline)) - Date.now();
          timer = setTimeout(() => { setView(null); load(); }, Math.max(1, Math.min(30_000, next)));
        }
      }).catch(error => {
        if (!current()) return;
        setView(null);
        setLoadingError(isStorageFull(error) ? STORAGE_FULL_MESSAGE : getErrorMessage(error, 'Could not read saved lessons.'));
      });
    };
    load();
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { setView(null); load(); }
    });
    return () => { stopped = true; clearTimeout(timer); foreground.remove(); };
  }, [open, revision]);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try { await work(); }
    catch (error) { setActionError(isStorageFull(error) ? STORAGE_FULL_MESSAGE : getErrorMessage(error, 'Could not update offline learning.')); }
    finally { setBusy(false); }
  }

  const data = view?.revision === revision ? view.data : null;
  const course = data?.courses.find(saved => saved.pack.course.id === selection?.courseId);
  const lesson = course?.pack.course.sections.flatMap(section => section.items).find(item => item.id === selection?.itemId);
  const progress = course?.pack.progress.find(item => item.itemId === lesson?.id);
  const pending = course?.pending.some(item => item.itemId === lesson?.id);
  const completionPending = course?.pending.some(item => item.itemId === lesson?.id && item.kind === 'complete');

  return <Card>
    <CardTitle>Offline lessons</CardTitle>
    <View accessibilityRole="radiogroup" accessibilityLabel="Learning mode" className="flex-row gap-2">
      <View className="flex-1"><Button label="Online mode" size="sm" variant={mode === 'online' ? 'primary' : 'outline'}
        accessibilityRole="radio" accessibilityState={{checked: mode === 'online'}} disabled={busy}
        onPress={() => void act(async () => {
          // Online mode streams everything, so free the space taken by saved video and audio.
          await setMode('online');
          await offlineMedia.retain([]);
          setMediaBytes(0);
        })} /></View>
      <View className="flex-1"><Button label="Offline mode" size="sm" variant={mode === 'offline' ? 'primary' : 'outline'}
        accessibilityRole="radio" accessibilityState={{checked: mode === 'offline'}} disabled={busy}
        onPress={() => void setMode('offline')} /></View>
    </View>
    <Text className="text-sm text-neutral-600">
      {mode === 'online'
        ? 'Online mode plays videos from YouTube and saves only text lessons, so it uses little storage.'
        : `Offline mode also saves each course's videos and audio, so you can review everything without a connection. Videos still play from YouTube whenever you are online. Saved files: ${formatBytes(mediaBytes)}.`}
    </Text>
    {courseId ? <Button label={mode === 'offline' ? 'Save course for offline use (with videos and audio)' : 'Save text lessons for offline use'}
      disabled={busy}
      onPress={() => void act(async () => {
        try {
          await offlineLearning.download(courseId, {withMedia: mode === 'offline', onProgress: (done, total) => setDownload({done, total})});
        } finally { setDownload(null); }
        setOpen(true);
      })} /> : null}
    {download ? <Text accessibilityLiveRegion="polite">Downloading {download.done} of {download.total} video and audio files…</Text> : null}
    <Button label={open ? 'Close saved lessons' : 'Open saved lessons'} variant="outline" onPress={() => {
      setOpen(value => !value);
      setSelection(null);
      setActionError(null);
    }} />
    {actionError ? <Text accessibilityRole="alert">{actionError}</Text> : null}
    {open ? <View className="gap-3">
      <Button label="Sync saved lessons" variant="outline" disabled={busy}
        onPress={() => void act(async () => { await offlineLearning.sync(); await flushPendingPlays(); })} />
      {loadingError ? <Text accessibilityRole="alert">{loadingError}</Text> : null}
      {data?.notice ? <Text accessibilityLiveRegion="polite">{data.notice}</Text> : null}
      {data && !data.courses.length ? <Text>There are no saved courses for this session.</Text> : null}
      {!data && !loadingError ? <Text>Checking saved lessons…</Text> : null}
      {course && lesson ? <>
        <Button label="Back to saved courses" variant="outline" onPress={() => setSelection(null)} />
        <Text accessibilityRole="header" className="text-lg font-semibold">{lesson.title}</Text>
        {lesson.type === 'video' || lesson.type === 'audio' ? <SavedMedia courseId={course.pack.course.id} lesson={lesson}
          startAt={progress?.lastPositionS ?? 0}
          onMilestone={(positionSeconds, progressPercent) => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {
            kind: 'progress', positionSeconds, progressPercent,
          }))}
          onComplete={() => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {kind: 'complete'}))} /> : null}
        {lesson.type === 'text' ? <ScrollView key={lesson.id} style={{maxHeight: 380}} nestedScrollEnabled scrollEventThrottle={200}
          onScroll={({nativeEvent}) => {
            const range = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height;
            if (range > 0) setReadingPercent(Math.max(0, Math.min(100, Math.floor(nativeEvent.contentOffset.y / range * 100))));
          }}>
          {lesson.description ? <Text>{lesson.description}</Text> : null}
          {isHtmlContent(lesson.information) ? <LessonReading content={lesson.information} />
            : <Text className="text-base text-neutral-900">{lesson.information}</Text>}
        </ScrollView> : null}
        <Text accessibilityLiveRegion="polite">
          {progress?.completedAt ? 'Completed' : completionPending ? 'Completion pending sync' :
            pending ? 'Reading progress pending sync' : `Synced reading progress ${progress?.progressPct ?? 0}%`}
        </Text>
        {!progress?.completedAt && !completionPending ? <>
          {lesson.type === 'text' ? <Button label="Save reading progress" variant="outline" disabled={busy}
            onPress={() => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {
              kind: 'progress', positionSeconds: 0, progressPercent: readingPercent,
            }))} /> : null}
          <Button label="Mark lesson complete" disabled={busy}
            onPress={() => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {kind: 'complete'}))} />
        </> : null}
      </> : data?.courses.map(saved => <View key={saved.pack.course.id} className="gap-2">
        <Text accessibilityRole="header" className="font-semibold">{saved.pack.course.title}</Text>
        {saved.pending.length ? <Text>{saved.pending.length} pending updates</Text> : null}
        {saved.pack.course.sections.flatMap(section => section.items).map(item => <Button key={item.id}
          label={item.type === 'text' ? item.title : `${item.type === 'video' ? 'Video' : 'Audio'}: ${item.title}`} variant="outline" onPress={() => {
            setReadingPercent(0);
            setSelection({courseId: saved.pack.course.id, itemId: item.id});
          }} />)}
        <Button label={`Remove saved course ${saved.pack.course.title}`} variant="outline" disabled={busy}
          onPress={() => void act(() => offlineLearning.remove(saved.pack.course.id))} />
      </View>)}
    </View> : null}
  </Card>;
}

/**
 * A saved video or audio lesson. With a downloaded file (Offline mode) it plays from the phone and counts as an
 * offline play; progress is queued at 25/50/75 percent and on completion, then synced when back online.
 * Without one it points to YouTube, which needs a connection.
 */
function SavedMedia({courseId, lesson, startAt, onMilestone, onComplete}: {
  courseId: string; lesson: OfflineMediaLesson; startAt: number;
  onMilestone: (positionSeconds: number, percent: number) => void; onComplete: () => void;
}) {
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  const queued = useRef(0);
  const tracker = useMemo(() => createPlayTracker(courseId, lesson.id, 'offline_file'), [courseId, lesson.id]);
  useEffect(() => {
    let active = true;
    void offlineMedia.localUri(courseId, lesson.id).then(value => { if (active) setUri(value); }, () => { if (active) setUri(null); });
    return () => { active = false; };
  }, [courseId, lesson]);
  if (uri === undefined) return <Text>Checking the saved file…</Text>;
  if (!uri) return <View className="gap-2">
    <Text>This {lesson.type} was not saved on this phone. Switch to Offline mode and save the course again to play it without a connection.</Text>
    {lesson.youtubeId ? <Button label="Watch on YouTube" variant="outline" onPress={() => {
      void lessonContentService.recordPlay(courseId, lesson.id, 'youtube_app', 'open_external');
      void Promise.resolve(Linking.openURL(`https://www.youtube.com/watch?v=${lesson.youtubeId}`)).catch(() => undefined);
    }} /> : null}
  </View>;
  const props = {
    url: uri,
    initialPosition: startAt,
    onProgress: (position: number, percent: number) => {
      tracker.progress(percent);
      const milestone = [75, 50, 25].find(m => percent >= m) ?? 0;
      if (milestone > queued.current) { queued.current = milestone; onMilestone(position, milestone); }
    },
    onComplete: () => { tracker.complete(); onComplete(); },
  };
  return <View className="gap-2">
    <Text className="text-xs text-neutral-500">Playing the copy saved on this phone.</Text>
    {lesson.type === 'video' ? <LessonVideo {...props} /> : <LessonAudio {...props} />}
  </View>;
}
