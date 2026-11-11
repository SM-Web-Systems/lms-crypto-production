import {useEffect, useSyncExternalStore} from 'react';
import {AppState, Linking, Text} from 'react-native';
import {usePathname, useRootNavigationState, useRouter, useSegments} from 'expo-router';
import type {NotificationResponse} from 'expo-notifications';
import {useAuth} from '@/context/AuthContext';
import {loadNativeNotifications, pushNotifications, supportsNativePush} from '@/services/pushNotifications';
import {Button} from './ui/Button';
import {Card, CardTitle} from './ui/Card';

export function PushNotificationsBridge() {
  const router = useRouter();
  const rootKey = useRootNavigationState()?.key;
  const pathname = usePathname();
  const [firstSegment] = useSegments();
  const settling = pathname === '/' || pathname === '/sso-callback' || firstSegment === '(auth)';
  const {user, isLoading, walletSignInPending} = useAuth();
  const ownerId = user?.deletionStatus === 'pending_deletion' ? undefined : user?.id;
  const canRoute = !!rootKey && !settling && !isLoading && !walletSignInPending && !!ownerId;

  useEffect(() => {
    if (!supportsNativePush) return;
    try {
      const notifications = loadNativeNotifications();
      notifications.setNotificationHandler({
        handleNotification: async notification => {
          const show = !!await pushNotifications.notification(notification.request.content.data);
          return {shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false};
        },
      });
      const rotation = notifications.addPushTokenListener(token => { void pushNotifications.rotate(token); });
      const foreground = AppState.addEventListener('change', state => {
        if (state === 'active') void pushNotifications.resume();
      });
      let renewAt = Date.now() + 30 * 60_000;
      const timer = setInterval(() => {
        if (AppState.currentState !== 'active') return;
        const {cleanupPending, status} = pushNotifications.getSnapshot();
        if (cleanupPending || status === 'error' || Date.now() >= renewAt) {
          renewAt = Date.now() + 30 * 60_000;
          void pushNotifications.resume();
        }
      }, 60_000);
      return () => {
        clearInterval(timer);
        foreground.remove();
        rotation.remove();
        notifications.setNotificationHandler(null);
      };
    } catch {
      // A build without the native module can still run the rest of the LMS.
    }
  }, []);

  useEffect(() => {
    if (!supportsNativePush || !canRoute) return;
    let cancelled = false;
    try {
      const notifications = loadNativeNotifications();
      const open = async (response: NotificationResponse) => {
        if (response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER) return;
        const revision = pushNotifications.getSnapshot().revision;
        const request = response.notification.request;
        const id = await pushNotifications.notification(request.content.data, true);
        if (cancelled || revision !== pushNotifications.getSnapshot().revision) return;
        if (notifications.getLastNotificationResponse()?.notification.request.identifier === request.identifier) {
          notifications.clearLastNotificationResponse();
        }
        if (id) router.push({pathname: '/notification', params: {id}});
      };
      const subscription = notifications.addNotificationResponseReceivedListener(response => { void open(response).catch(() => undefined); });
      const last = notifications.getLastNotificationResponse();
      if (last) void open(last).catch(() => undefined);
      return () => { cancelled = true; subscription.remove(); };
    } catch {
      // Native notification responses are unavailable in this build.
    }
  }, [canRoute, ownerId, router]);
  return null;
}

export function PushNotificationSettings() {
  const {status, enabled, cleanupPending} = useSyncExternalStore(
    pushNotifications.subscribe, pushNotifications.getSnapshot, pushNotifications.getSnapshot,
  );
  if (!supportsNativePush) return null;
  const messages = {
    off: 'Get an alert on this device when you have an LMS update.',
    on: 'Push notifications are on for this account on this device.',
    pending: 'Updating push notification settings…',
    denied: 'Allow notifications in your device settings to receive LMS alerts.',
    unavailable: 'Push notifications are unavailable for this build or server.',
    error: 'Could not update push notifications. Check your connection and try again.',
  };
  return <Card>
    <CardTitle>Push notifications</CardTitle>
    <Text accessibilityLiveRegion="polite" className="my-2">
      {cleanupPending && !enabled ? 'Push notifications are off on this device. Server cleanup will retry when connected.' : messages[status]}
    </Text>
    {status === 'denied' ? <Button label="Open device settings" variant="outline"
      onPress={() => { void Linking.openSettings().catch(() => undefined); }}/> : null}
    {enabled ? <Button label="Turn off push notifications" variant="outline"
      onPress={() => { void pushNotifications.disable(); }}/> : null}
    {status !== 'on' && status !== 'pending' ? <Button
      label={enabled ? 'Retry push setup' : 'Turn on push notifications'}
      onPress={() => { void pushNotifications.enable(); }}/> : null}
  </Card>;
}
