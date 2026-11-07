import {useEffect, useState, useSyncExternalStore} from 'react';
import {ScrollView, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Redirect, useLocalSearchParams, useRouter} from 'expo-router';
import {useAuth} from '@/context/AuthContext';
import {Button} from '@/components/ui/Button';
import {LoadingView} from '@/components/LoadingView';
import {ErrorBanner} from '@/components/ErrorBanner';
import {markPushNotificationRead, pushNotifications, readPushNotification, type NotificationDetail} from '@/services/pushNotifications';
import {canOpenStudentPath, mobileHome} from '@/utils/authorization';
import {getErrorMessage} from '@/utils/apiError';

function studentDestination(link: string | null) {
  switch (link) {
    case '/student/course': return '/(student)/course';
    case '/student/submissions': return '/(student)/submissions';
    default: return null;
  }
}

export default function NotificationScreen() {
  const {id} = useLocalSearchParams<{id?: string}>();
  const {user, isLoading} = useAuth();
  const router = useRouter();
  const {revision} = useSyncExternalStore(
    pushNotifications.subscribe, pushNotifications.getSnapshot, pushNotifications.getSnapshot,
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: string; ownerId: string; revision: number; attempt: number; detail?: NotificationDetail; error?: string;
  }>();
  const ownerId = user?.deletionStatus === 'pending_deletion' ? undefined : user?.id;
  const notificationId = typeof id === 'string' ? id : '';

  useEffect(() => {
    if (!ownerId || isLoading) return;
    let cancelled = false;
    const request = {id: notificationId, ownerId, revision, attempt};
    void readPushNotification(notificationId).then(detail => {
      if (cancelled || revision !== pushNotifications.getSnapshot().revision) return;
      setResult({...request, detail});
      if (!detail.read) void markPushNotificationRead(notificationId).catch(() => undefined);
    }).catch(error => {
      if (!cancelled && revision === pushNotifications.getSnapshot().revision) {
        setResult({...request, error: getErrorMessage(error, 'Could not open this notification.')});
      }
    });
    return () => { cancelled = true; };
  }, [notificationId, ownerId, isLoading, revision, attempt]);

  if (isLoading) return <LoadingView />;
  if (!ownerId) return <Redirect href={mobileHome(user)} />;
  const current = result?.id === notificationId && result.ownerId === ownerId
    && result.revision === revision && result.attempt === attempt ? result : null;
  if (!current) return <LoadingView message="Loading notification…" />;
  const destination = studentDestination(current.detail?.link ?? null);
  return <SafeAreaView className="flex-1 bg-neutral-50">
    <ScrollView contentContainerClassName="p-4 gap-4">
      {current.error ? <ErrorBanner message={current.error} onRetry={() => setAttempt(value => value + 1)} /> : null}
      {current.detail ? <>
        <Text accessibilityRole="header" className="text-2xl font-bold text-neutral-900">{current.detail.title}</Text>
        <Text className="text-base text-neutral-900">{current.detail.body}</Text>
      </> : null}
      {destination && canOpenStudentPath(user, destination)
        ? <Button label="Open in LMS" onPress={() => router.push(destination)} /> : null}
      <Button label="Back to your workspace" variant="outline" onPress={() => router.replace(mobileHome(user))} />
    </ScrollView>
  </SafeAreaView>;
}
