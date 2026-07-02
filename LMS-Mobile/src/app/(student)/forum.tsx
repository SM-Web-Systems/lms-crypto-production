import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { forumService } from '@/services/forumService';
import { courseService } from '@/services/courseService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import type { ForumTopic, ForumPost } from '@/types/forum';
import type { Course } from '@/types/course';
import { formatDate, formatTime } from '@/utils/format';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

type ChannelId = 'general' | string;

export default function ForumScreen() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChannelId>('general');
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    courseService.fetchCourses().then(setCourses).catch(() => setCourses([])).finally(() => setLoading(false));
  }, []);

  const loadTopics = useCallback(async (channelId: ChannelId) => {
    setTopicsLoading(true);
    setError(null);
    try {
      const courseId = channelId === 'general' ? null : channelId;
      const list = await forumService.getTopics(courseId);
      setTopics(list);
    } catch (e) {
      setTopics([]);
      setError(getErrorMessage(e, 'Could not load forum topics.'));
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadTopics(activeChannel);
  }, [activeChannel, loading, loadTopics]);

  useEffect(() => {
    if (!selectedTopic) {
      setPosts([]);
      return;
    }
    setPostsLoading(true);
    forumService
      .getPosts(selectedTopic.id)
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
  }, [selectedTopic]);

  const handleCreateTopic = async () => {
    if (!user || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    try {
      await forumService.createTopic(user, {
        title: newTitle.trim(),
        body: newBody.trim(),
        courseId: activeChannel === 'general' ? null : activeChannel,
      });
      setNewTitle('');
      setNewBody('');
      setShowNewTopic(false);
      await loadTopics(activeChannel);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not create topic.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!user || !selectedTopic || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await forumService.createPost(user, selectedTopic.id, { body: replyBody.trim() });
      setReplyBody('');
      const [updatedPosts, updatedTopic] = await Promise.all([
        forumService.getPosts(selectedTopic.id),
        forumService.getTopic(selectedTopic.id),
      ]);
      setPosts(updatedPosts);
      if (updatedTopic) setSelectedTopic(updatedTopic);
      await loadTopics(activeChannel);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not post reply.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingView message="Loading forum…" />;

  if (selectedTopic) {
    return (
      <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-4 pb-8">
        <Pressable onPress={() => setSelectedTopic(null)} className="flex-row items-center gap-2">
          <Ionicons name="arrow-back" size={18} color={brand.primary.dark} />
          <Text className="font-semibold text-neutral-800">Back to discussions</Text>
        </Pressable>
        <Card>
          <Text className="text-xl font-bold text-neutral-900">{selectedTopic.title}</Text>
          <Text className="mt-1 text-xs text-neutral-400">
            {selectedTopic.author?.name ?? 'Unknown'} · {formatDate(selectedTopic.createdAt)}
          </Text>
          <Text className="mt-3 text-sm text-neutral-700">{selectedTopic.body}</Text>
        </Card>
        {postsLoading ? (
          <LoadingView message="Loading replies…" />
        ) : (
          posts.map((post) => (
            <View key={post.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <Text className="text-xs font-semibold text-neutral-500">{post.author?.name ?? 'Unknown'}</Text>
              <Text className="mt-1 text-sm text-neutral-800">{post.body}</Text>
              <Text className="mt-2 text-xs text-neutral-400">{formatTime(post.createdAt)}</Text>
            </View>
          ))
        )}
        <Input label="Reply" value={replyBody} onChangeText={setReplyBody} placeholder="Write a reply…" multiline />
        <Button label={submitting ? 'Posting…' : 'Post reply'} onPress={handleReply} disabled={submitting || !replyBody.trim()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8"
      refreshControl={
        <RefreshControl refreshing={topicsLoading} onRefresh={() => loadTopics(activeChannel)} tintColor={brand.accent.teal} />
      }>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setActiveChannel('general')}
            className={`rounded-full px-4 py-2 ${activeChannel === 'general' ? 'bg-accent-teal' : 'bg-white border border-neutral-200'}`}>
            <Text className={`text-sm font-semibold ${activeChannel === 'general' ? 'text-white' : 'text-neutral-700'}`}>General</Text>
          </Pressable>
          {courses.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setActiveChannel(c.id)}
              className={`rounded-full px-4 py-2 ${activeChannel === c.id ? 'bg-accent-teal' : 'bg-white border border-neutral-200'}`}>
              <Text className={`text-sm font-semibold ${activeChannel === c.id ? 'text-white' : 'text-neutral-700'}`}>{c.title}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {error ? <ErrorBanner message={error} onRetry={() => loadTopics(activeChannel)} /> : null}

      <Button label={showNewTopic ? 'Cancel new topic' : 'New topic'} variant="outline" onPress={() => setShowNewTopic((v) => !v)} />

      {showNewTopic ? (
        <Card>
          <Input label="Title" value={newTitle} onChangeText={setNewTitle} placeholder="Topic title" />
          <Input label="Body" value={newBody} onChangeText={setNewBody} placeholder="What would you like to discuss?" multiline />
          <View className="mt-3">
            <Button label={submitting ? 'Creating…' : 'Create topic'} onPress={handleCreateTopic} disabled={submitting} />
          </View>
        </Card>
      ) : null}

      {topicsLoading && topics.length === 0 ? (
        <LoadingView message="Loading topics…" />
      ) : topics.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="No discussions yet" message="Start the first topic in this channel." />
      ) : (
        topics.map((topic) => (
          <Pressable key={topic.id} onPress={() => setSelectedTopic(topic)} className="rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-90">
            <Text className="font-bold text-neutral-900">{topic.title}</Text>
            <Text className="mt-1 text-sm text-neutral-600" numberOfLines={2}>
              {topic.body}
            </Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-xs text-neutral-400">{topic.author?.name ?? 'Unknown'}</Text>
              <Text className="text-xs text-neutral-400">{topic.postCount} replies</Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
