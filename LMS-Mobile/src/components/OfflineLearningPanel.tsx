import {useEffect, useState, useSyncExternalStore} from 'react';
import {AppState, ScrollView, Text, View} from 'react-native';
import {offlineLearning, supportsOfflineLearning} from '@/services/offlineLearningNative';
import {getErrorMessage} from '@/utils/apiError';
import {Button} from './ui/Button';
import {Card, CardTitle} from './ui/Card';

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
        setLoadingError(getErrorMessage(error, 'Could not read saved lessons.'));
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
    catch (error) { setActionError(getErrorMessage(error, 'Could not update offline learning.')); }
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
    {courseId ? <Button label="Save text lessons for offline use" disabled={busy}
      onPress={() => void act(async () => { await offlineLearning.download(courseId); setOpen(true); })} /> : null}
    <Button label={open ? 'Close saved lessons' : 'Open saved lessons'} variant="outline" onPress={() => {
      setOpen(value => !value);
      setSelection(null);
      setActionError(null);
    }} />
    {actionError ? <Text accessibilityRole="alert">{actionError}</Text> : null}
    {open ? <View className="gap-3">
      <Button label="Sync saved lessons" variant="outline" disabled={busy} onPress={() => void act(() => offlineLearning.sync())} />
      {loadingError ? <Text accessibilityRole="alert">{loadingError}</Text> : null}
      {data?.notice ? <Text accessibilityLiveRegion="polite">{data.notice}</Text> : null}
      {data && !data.courses.length ? <Text>There are no saved courses for this session.</Text> : null}
      {!data && !loadingError ? <Text>Checking saved lessons…</Text> : null}
      {course && lesson ? <>
        <Button label="Back to saved courses" variant="outline" onPress={() => setSelection(null)} />
        <Text accessibilityRole="header" className="text-lg font-semibold">{lesson.title}</Text>
        <ScrollView key={lesson.id} style={{maxHeight: 380}} nestedScrollEnabled scrollEventThrottle={200}
          onScroll={({nativeEvent}) => {
            const range = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height;
            if (range > 0) setReadingPercent(Math.max(0, Math.min(100, Math.floor(nativeEvent.contentOffset.y / range * 100))));
          }}>
          {lesson.description ? <Text>{lesson.description}</Text> : null}
          <Text className="text-base text-neutral-900">{lesson.information}</Text>
        </ScrollView>
        <Text accessibilityLiveRegion="polite">
          {progress?.completedAt ? 'Completed' : completionPending ? 'Completion pending sync' :
            pending ? 'Reading progress pending sync' : `Synced reading progress ${progress?.progressPct ?? 0}%`}
        </Text>
        {!progress?.completedAt && !completionPending ? <>
          <Button label="Save reading progress" variant="outline" disabled={busy}
            onPress={() => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {
              kind: 'progress', positionSeconds: 0, progressPercent: readingPercent,
            }))} />
          <Button label="Mark lesson complete" disabled={busy}
            onPress={() => void act(() => offlineLearning.queue(course.pack.course.id, lesson.id, {kind: 'complete'}))} />
        </> : null}
      </> : data?.courses.map(saved => <View key={saved.pack.course.id} className="gap-2">
        <Text accessibilityRole="header" className="font-semibold">{saved.pack.course.title}</Text>
        {saved.pending.length ? <Text>{saved.pending.length} pending updates</Text> : null}
        {saved.pack.course.sections.flatMap(section => section.items).map(item => <Button key={item.id}
          label={item.title} variant="outline" onPress={() => {
            setReadingPercent(0);
            setSelection({courseId: saved.pack.course.id, itemId: item.id});
          }} />)}
        <Button label={`Remove saved course ${saved.pack.course.title}`} variant="outline" disabled={busy}
          onPress={() => void act(() => offlineLearning.remove(saved.pack.course.id))} />
      </View>)}
    </View> : null}
  </Card>;
}
