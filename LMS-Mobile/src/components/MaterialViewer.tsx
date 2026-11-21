import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Platform, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import type { CourseItem, CourseSection } from '@/types/course';
import type { LessonProgress } from '@/services/courseCompletionService';
import { documentsService } from '@/services/documentsService';
import { getAuthToken } from '@/lib/api';
import { getIframeVideoEmbedSrc, isDirectVideoFileUrl, extractYoutubeId } from '@/utils/mediaUrl';
import { isWebResource, toReadableResourceUrl } from '@/utils/courseContent';
import { getErrorMessage } from '@/utils/apiError';
import { LessonAudio, LessonVideo } from './LessonMedia';
import { LessonYouTube } from './LessonYouTube';
import { LessonReading, isHtmlContent } from './LessonReading';
import { createPlayTracker, lessonContentService, type PlaySource } from '@/services/lessonContentService';
import { LessonQuiz } from './LessonQuiz';
import { LessonAssignment } from './LessonAssignment';
import { Button } from './ui/Button';
import { ErrorBanner } from './ErrorBanner';

function ResourcePreview({ url, headers }: { url: string; headers?: Record<string, string> }) {
  const [error, setError] = useState(false);
  return <View className="gap-2">
    {Platform.OS !== 'web' ? <WebView source={{ uri: url, headers }} style={{ height: 400, borderRadius: 12 }}
      startInLoadingState onError={() => setError(true)} onHttpError={() => setError(true)}
      onShouldStartLoadWithRequest={(request) => !headers || request.url === 'about:blank' || request.url.startsWith(`${new URL(url).origin}/`)} /> : <Text>Use the button below to open this resource.</Text>}
    {error ? <ErrorBanner message="The preview could not load. Use the open or download button below." /> : null}
  </View>;
}

/** A text lesson from a URL: the server's formatted copy when it has one (approved GitHub markdown), else the page itself. */
function ServerReading({ courseId, itemId, url }: { courseId: string; itemId: string; url: string }) {
  const [state, setState] = useState<{ html: string } | 'loading' | 'fallback'>('loading');
  useEffect(() => {
    let cancelled = false;
    lessonContentService.getReading(courseId, itemId)
      .then((reading) => { if (!cancelled) setState({ html: reading.html }); })
      .catch(() => { if (!cancelled) setState('fallback'); });
    return () => { cancelled = true; };
  }, [courseId, itemId]);
  if (state === 'loading') return <Text>Loading reading…</Text>;
  if (state === 'fallback') return <ResourcePreview url={toReadableResourceUrl(url)} />;
  return <LessonReading content={state.html} />;
}

function AuthenticatedPdfViewer({ documentId }: { documentId: string }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAuthToken().then((token) => { if (!cancelled) setHeaders(token ? { Authorization: `Bearer ${token}` } : {}); });
    return () => { cancelled = true; };
  }, [documentId]);
  // Android WebView cannot display a PDF. Download with bearer authentication and open the native share sheet.
  if (Platform.OS !== 'ios') return <Text>Download the PDF to open it in a document app.</Text>;
  if (!headers) return <Text>Loading document…</Text>;
  return <ResourcePreview url={documentsService.getDownloadUrl(documentId)} headers={headers} />;
}

export function MaterialViewer({ section, item, courseId, weekId, progress, onClose, onComplete, onProgress, onAssessmentSubmitted }: {
  section: CourseSection;
  item: CourseItem;
  courseId: string;
  weekId?: string;
  progress?: LessonProgress;
  onClose: () => void;
  onComplete: () => Promise<void>;
  onProgress: (position: number, percent: number) => void;
  onAssessmentSubmitted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (error) { setError(getErrorMessage(error, 'Could not open this resource. Please try again.')); }
    finally { setBusy(false); }
  };
  const open = (url: string) => action(async () => {
    if (!isWebResource(url)) throw new Error('This resource has not been configured correctly. Please contact your instructor.');
    await Linking.openURL(url);
  });
  const missing = <Text>This resource has not been configured yet. Please contact your instructor.</Text>;
  let content: React.ReactNode = missing;
  let available = false;
  let readingInBody = false;
  const videoYoutube = item.type === 'video' && !isDirectVideoFileUrl(item.url) ? extractYoutubeId(item.url) : null;
  const audioYoutube = item.type === 'audio' ? extractYoutubeId(item.youtubeUrl || item.url || '') : null;
  const youtubeId = videoYoutube || audioYoutube;
  const playSource: PlaySource = youtubeId ? 'youtube_embed' : 'direct_file';
  const tracker = useMemo(() => createPlayTracker(courseId, item.id, playSource), [courseId, item.id, playSource]);
  const mediaProps = {
    initialPosition: progress?.lastPositionS ?? 0,
    onProgress: (position: number, percent: number) => { tracker.progress(percent); onProgress(position, percent); },
    onComplete: () => { tracker.complete(); void onComplete(); },
  };
  // Opening the YouTube app keeps the view on the channel, and lets learners save the video there for offline use.
  const youtubeAppButton = youtubeId ? <Button label="Watch or save in YouTube app" variant="outline" onPress={() => {
    void lessonContentService.recordPlay(courseId, item.id, 'youtube_app', 'open_external');
    void open(`https://www.youtube.com/watch?v=${youtubeId}`);
  }} /> : null;

  if (item.type === 'video') {
    available = isWebResource(item.url);
    if (available) content = <View className="gap-3">
      {isDirectVideoFileUrl(item.url) ? <LessonVideo url={item.url} {...mediaProps} /> : extractYoutubeId(item.url) ? <LessonYouTube url={item.url} {...mediaProps} /> : <ResourcePreview url={getIframeVideoEmbedSrc(item.url)} />}
      {youtubeAppButton ?? <Button label="Open video" variant="outline" onPress={() => open(item.url)} />}
      {isWebResource(item.downloadUrl) ? <Button label="Download video" variant="outline" onPress={() => open(item.downloadUrl!)} /> : null}
    </View>;
  } else if (item.type === 'audio') {
    const embedded = item.youtubeUrl || (extractYoutubeId(item.url) ? item.url : undefined);
    // Same order as the web viewer: YouTube is the primary player and `url` is a legacy file kept for
    // older courses. Only play that file when there is no YouTube player to show.
    const direct = !isWebResource(embedded) && !extractYoutubeId(item.url) && isWebResource(item.url) ? item.url : undefined;
    available = !!direct || isWebResource(embedded);
    if (available) content = <View className="gap-3">
      {isWebResource(embedded) ? <LessonYouTube url={embedded} {...mediaProps} /> : direct ? <LessonAudio url={direct} {...mediaProps} /> : null}
      {direct ? <Button label="Open audio" variant="outline" onPress={() => open(direct)} /> : null}
      {isWebResource(embedded) ? youtubeAppButton ?? <Button label="Open listening video" variant="outline" onPress={() => open(embedded)} /> : null}
      {isWebResource(item.downloadUrl) ? <Button label="Download audio" variant="outline" onPress={() => open(item.downloadUrl!)} /> : null}
    </View>;
  } else if (item.type === 'text' && !isWebResource(item.url) && item.information?.trim()) {
    // GitHub and ZIP imports store the lesson itself in `information` (server-rendered, sanitized HTML), with no URL.
    available = true;
    readingInBody = true;
    content = <LessonReading content={item.information} />;
  } else if (item.type === 'text' || item.type === 'link') {
    available = isWebResource(item.url);
    if (available) content = <View className="gap-3">
      {item.type === 'text' ? <ServerReading courseId={courseId} itemId={item.id} url={item.url} /> : null}
      <Button label={item.type === 'text' ? 'Open reading' : 'Open link'} onPress={() => open(item.url)} />
    </View>;
  } else if (item.type === 'pdf' || item.type === 'download') {
    available = !!item.documentId || isWebResource(item.fileUrl);
    if (available) content = <View className="gap-3">
      {item.type === 'pdf' ? item.documentId ? <AuthenticatedPdfViewer documentId={item.documentId} />
        : Platform.OS === 'ios' ? <ResourcePreview url={item.fileUrl!} /> : <Text>Open the PDF in a document app.</Text> : <Text>{item.fileName}</Text>}
      <Button label={item.type === 'pdf' ? 'Download PDF' : 'Download file'} disabled={busy} onPress={() => {
        if (item.documentId) void action(() => documentsService.download(item.documentId!, item.type === 'download' ? item.fileName : `${item.id}.pdf`));
        else void open(item.fileUrl!);
      }} />
    </View>;
  } else if (item.type === 'quiz') {
    content = item.quizId ? <LessonQuiz quizId={item.quizId} courseId={courseId} onSubmitted={onAssessmentSubmitted} /> : missing;
  } else if (item.type === 'assignment') {
    content = <LessonAssignment courseId={courseId} weekId={weekId} item={item} onSubmitted={onAssessmentSubmitted} />;
  } else {
    content = <Text>This lesson type ({item.originalType}) is not supported in this app yet. Please contact your instructor.</Text>;
  }
  return <View className="gap-4">
    <Button label="Back to materials" variant="outline" onPress={onClose} />
    <View>
      <Text className="text-xs uppercase text-neutral-400">{section.title}</Text>
      <Text className="mt-1 text-xl font-bold text-neutral-900">{item.title}</Text>
      {item.information && !readingInBody ? isHtmlContent(item.information)
        ? <View className="mt-2"><LessonReading content={item.information} height={160} /></View>
        : <Text className="mt-2 text-neutral-600">{item.information}</Text> : null}
      {item.description ? <Text className="mt-1 text-neutral-500">{item.description}</Text> : null}
    </View>
    {content}
    {error ? <ErrorBanner message={error} /> : null}
    {progress?.completedAt ? <Text accessibilityLiveRegion="polite">Lesson complete</Text> : available ? <Button label="Mark lesson complete" disabled={busy} onPress={() => action(onComplete)} /> : null}
  </View>;
}
