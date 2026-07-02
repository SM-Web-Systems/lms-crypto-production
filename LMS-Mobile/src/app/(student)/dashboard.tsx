import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AnnouncementsPanel } from '@/components/AnnouncementsPanel';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingView } from '@/components/LoadingView';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { submissionsService } from '@/services/submissionsService';
import { quizService } from '@/services/quizService';
import type { Submission } from '@/types/api';
import { greetingForHour, formatDate } from '@/utils/format';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

const QUICK_ACTIONS = [
  { href: '/(student)/course', title: 'Course', blurb: 'Lessons & progress', icon: 'book-outline' as const },
  { href: '/(student)/quizzes', title: 'Quizzes', blurb: 'Practice & checks', icon: 'clipboard-outline' as const },
  { href: '/(student)/submissions', title: 'Submissions', blurb: 'Upload work', icon: 'cloud-upload-outline' as const },
  { href: '/(student)/documents', title: 'Resources', blurb: 'Files & readings', icon: 'library-outline' as const },
  { href: '/(student)/messages', title: 'Messages', blurb: 'Chat with classmates', icon: 'mail-outline' as const },
  { href: '/(student)/forum', title: 'Forum', blurb: 'Discuss & ask', icon: 'chatbubbles-outline' as const },
  { href: '/(student)/profile', title: 'Profile', blurb: 'Your account & bio', icon: 'person-outline' as const },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quizPassed, setQuizPassed] = useState(0);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [subsRes, completions] = await Promise.all([
        submissionsService.getAll({ limit: 50 }),
        user?.id ? quizService.getCompletionsForUser(user.id) : Promise.resolve([]),
      ]);
      setSubmissions(subsRes.submissions);
      setQuizPassed(completions.filter((c) => c.passed).length);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadData()]);
    setRefreshing(false);
  }, [refresh, loadData]);

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const approvedCount = submissions.filter((s) => s.status === 'approved').length;
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const greeting = greetingForHour(new Date().getHours());

  const stats = useMemo(
    () => [
      { title: 'Uploads', value: submissions.length, icon: 'document-text-outline' as const },
      { title: 'Pending', value: pendingCount, icon: 'time-outline' as const },
      { title: 'Approved', value: approvedCount, icon: 'checkmark-circle-outline' as const },
      { title: 'Quizzes passed', value: quizPassed, icon: 'clipboard-outline' as const },
    ],
    [submissions.length, pendingCount, approvedCount, quizPassed]
  );

  if (loading && !refreshing) return <LoadingView message="Loading dashboard…" />;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent.teal} />}>
      <Pressable
        onPress={() => router.push('/(student)/profile')}
        className="overflow-hidden rounded-2xl bg-primary-dark p-5 active:opacity-95">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm text-white/70">{greeting}</Text>
            <Text className="mt-1 text-2xl font-extrabold text-white">{firstName}!</Text>
            <Text className="mt-2 text-sm text-white/80">
              Your learning hub — course, quizzes, and classmates are one tap away.
            </Text>
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="person-outline" size={22} color="#fff" />
          </View>
        </View>
        <Text className="mt-3 text-xs font-semibold text-white/70">Tap to open your profile</Text>
        <View className="mt-4 flex-row gap-2">
          <Button label="Go to course" onPress={() => router.push('/(student)/course')} />
          <Button label="Take a quiz" variant="outline" onPress={() => router.push('/(student)/quizzes')} />
        </View>
      </Pressable>

      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}

      <View>
        <Text className="mb-3 text-lg font-bold text-neutral-900">Jump in</Text>
        <View className="flex-row flex-wrap gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.href}
              onPress={() => router.push(action.href as never)}
              className="w-[47%] rounded-xl border border-neutral-200 bg-white p-4 active:opacity-80">
              <View className="mb-2 h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Ionicons name={action.icon} size={20} color={brand.accent.teal} />
              </View>
              <Text className="font-semibold text-neutral-900">{action.title}</Text>
              <Text className="mt-0.5 text-xs text-neutral-500">{action.blurb}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text className="mb-3 text-lg font-bold text-neutral-900">Your numbers</Text>
        <View className="flex-row flex-wrap gap-3">
          {stats.map((stat) => (
            <View key={stat.title} className="min-w-[46%] flex-1 rounded-xl border border-neutral-200 bg-white p-4">
              <Ionicons name={stat.icon} size={22} color={brand.accent.teal} />
              <Text className="mt-2 text-2xl font-bold text-neutral-900">{stat.value}</Text>
              <Text className="text-xs text-neutral-500">{stat.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <AnnouncementsPanel />

      <Card>
        <View className="mb-3 flex-row items-center justify-between">
          <CardTitle>Recent submissions</CardTitle>
          <Pressable onPress={() => router.push('/(student)/submissions')}>
            <Text className="text-sm font-semibold text-accent-teal">View all</Text>
          </Pressable>
        </View>
        {submissions.length === 0 ? (
          <EmptyState
            icon="cloud-upload-outline"
            title="No submissions yet"
            message='Open the Submissions tab to upload your first assignment.'
          />
        ) : (
          <View className="gap-3">
            {submissions.slice(0, 5).map((s) => (
              <View key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <Text className="font-semibold text-neutral-900">{s.title}</Text>
                {s.description ? <Text className="mt-1 text-sm text-neutral-600">{s.description}</Text> : null}
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-xs text-neutral-400">{formatDate(s.submittedAt)}</Text>
                  <StatusBadge status={s.status} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Button label="Sign out" variant="outline" onPress={logout} />
    </ScrollView>
  );
}
