import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/useAuth';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import Input, { TextArea } from '../components/Input';
import { forumService } from '../services/forumService';
import { courseService } from '../services/courseService';
import type { ForumTopic, ForumPost } from '../types/forum';
import type { Course } from '../types/course';
import {
  MessageCircle,
  Plus,
  ArrowLeft,
  Send,
  Loader2,
  User,
  Calendar,
  MessageSquare,
  AlertCircle,
  BookOpen,
  Globe,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

// Channel type: 'general' or a course id
type ChannelId = 'general' | string;

const Forum: React.FC = () => {
  const { user } = useAuth();

  // Channels
  const [courses, setCourses] = useState<Course[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<ChannelId>('general');

  // Topic list for active channel
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Thread view
  const [selectedTopic, setSelectedTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  // New topic form
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newTopicError, setNewTopicError] = useState<string | null>(null);

  // Load available courses (used to build channel tabs)
  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    courseService
      .fetchCourses()
      .then((list) => { if (!cancelled) setCourses(list); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setChannelsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadTopics = useCallback(async (channelId: ChannelId) => {
    setListError(null);
    setTopicsLoading(true);
    try {
      const courseId = channelId === 'general' ? null : channelId;
      const list = await forumService.getTopics(courseId);
      setTopics(Array.isArray(list) ? list : []);
    } catch (e) {
      setTopics([]);
      setListError(getErrorMessage(e, 'Could not load forum topics.'));
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  // Reload topics whenever the active channel changes
  useEffect(() => {
    setSelectedTopic(null);
    setPosts([]);
    setShowNewTopic(false);
    loadTopics(activeChannel);
  }, [activeChannel, loadTopics]);

  // Load posts when a topic is opened
  useEffect(() => {
    if (!selectedTopic) return;
    setReplyBody('');
    let cancelled = false;
    setPostsLoading(true);
    setPosts([]);
    forumService
      .getPosts(selectedTopic.id)
      .then((list) => {
        if (!cancelled) {
          setPosts(Array.isArray(list) ? list : []);
          setThreadError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPosts([]);
          setThreadError(getErrorMessage(e, 'Could not load replies.'));
        }
      })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTopic]);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !newBody.trim()) return;
    setSubmitting(true);
    setNewTopicError(null);
    try {
      const courseId = activeChannel === 'general' ? null : activeChannel;
      await forumService.createTopic(user, {
        title: newTitle.trim(),
        body: newBody.trim(),
        courseId,
      });
      setNewTitle('');
      setNewBody('');
      setShowNewTopic(false);
      await loadTopics(activeChannel);
    } catch (err) {
      setNewTopicError(getErrorMessage(err, 'Could not create the topic.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTopic || !replyBody.trim()) return;
    setSubmitting(true);
    setThreadError(null);
    try {
      await forumService.createPost(user, selectedTopic.id, { body: replyBody.trim() });
      setReplyBody('');
      const [updatedPosts, updatedTopic] = await Promise.all([
        forumService.getPosts(selectedTopic.id),
        forumService.getTopic(selectedTopic.id),
      ]);
      setPosts(Array.isArray(updatedPosts) ? updatedPosts : []);
      setSelectedTopic(updatedTopic ?? selectedTopic);
      await loadTopics(activeChannel);
    } catch (err) {
      setThreadError(getErrorMessage(err, 'Could not post your reply.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openTopic = (topic: ForumTopic) => {
    setSelectedTopic(topic);
    setThreadError(null);
  };

  const backToList = () => {
    setSelectedTopic(null);
    setPosts([]);
    setThreadError(null);
  };

  const switchChannel = (id: ChannelId) => {
    if (id === activeChannel) return;
    setActiveChannel(id);
  };

  const activeCourseName =
    activeChannel === 'general'
      ? null
      : courses.find((c) => c.id === activeChannel)?.title ?? 'Course';

  // ── Thread view ──────────────────────────────────────────────────────────────
  if (selectedTopic) {
    const author = selectedTopic.author ?? { name: 'Unknown', role: 'student', isDeleted: false };
    return (
      <div>
        {/* Channel breadcrumb */}
        <ChannelBreadcrumb
          channelName={activeCourseName ?? 'General'}
          isGeneral={activeChannel === 'general'}
        />

        <div className="mb-6">
          <Button variant="outline" onClick={backToList} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to discussions
          </Button>
          <Card>
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold text-neutral-800 mb-2">{selectedTopic.title}</h1>
              <PostAuthor author={author} createdAt={selectedTopic.createdAt} />
              <div className="mt-4 text-neutral-700 whitespace-pre-wrap">{selectedTopic.body}</div>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-lg font-semibold text-neutral-800 mb-3">
          Replies ({posts.length})
        </h2>
        {threadError && !postsLoading ? (
          <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{threadError}</span>
          </div>
        ) : null}
        {postsLoading ? (
          <div className="flex items-center justify-center py-12 mb-8">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardContent className="p-4">
                  <PostAuthor
                    author={post.author ?? { name: 'Unknown', role: 'student', isDeleted: false }}
                    createdAt={post.createdAt}
                  />
                  <div className="mt-3 text-neutral-700 whitespace-pre-wrap">{post.body}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium text-neutral-800 mb-3">Add a reply</h3>
            <form onSubmit={handleReply} className="space-y-3">
              <TextArea
                placeholder="Write your reply..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={4}
                required
              />
              <Button type="submit" disabled={submitting || !replyBody.trim()}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Reply
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center">
        <MessageCircle className="h-8 w-8 text-primary-600 mr-3 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Class discussions</h1>
          <p className="text-neutral-600 mt-1">
            Ask questions and discuss. Choose a channel below.
          </p>
        </div>
      </div>

      {/* Channel tab bar */}
      <div className="mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-neutral-200">
          <ChannelTab
            id="general"
            label="General"
            isActive={activeChannel === 'general'}
            isGeneral
            onClick={switchChannel}
          />
          {channelsLoading ? (
            <span className="flex items-center gap-1 px-3 py-2 text-sm text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading channels…
            </span>
          ) : (
            courses.map((course) => (
              <ChannelTab
                key={course.id}
                id={course.id}
                label={course.title}
                isActive={activeChannel === course.id}
                isGeneral={false}
                onClick={switchChannel}
              />
            ))
          )}
        </div>
      </div>

      {/* Active channel breadcrumb */}
      <ChannelBreadcrumb
        channelName={activeCourseName ?? 'General'}
        isGeneral={activeChannel === 'general'}
      />

      {/* Errors */}
      {listError ? (
        <div className="mb-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not load discussions</p>
            <p className="text-sm mt-1">{listError}</p>
          </div>
        </div>
      ) : null}

      {/* Start discussion CTA */}
      <Card className="mb-6 border-2 border-accent-teal/40 bg-accent-teal/5">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-semibold text-neutral-800">
                Start a discussion
                {activeChannel !== 'general' && activeCourseName && (
                  <span className="ml-2 text-sm font-normal text-neutral-500">
                    in {activeCourseName}
                  </span>
                )}
              </h2>
              <p className="text-sm text-neutral-600 mt-0.5">Post a question or topic for the class.</p>
            </div>
            <Button
              onClick={() => setShowNewTopic(true)}
              className="w-full sm:w-auto shrink-0"
              size="lg"
            >
              <Plus className="h-5 w-5 mr-2" />
              New discussion
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* New topic form */}
      {showNewTopic && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-neutral-800 mb-1">New discussion</h2>
            {activeChannel !== 'general' && activeCourseName && (
              <p className="text-sm text-neutral-500 mb-4 flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                Posting in <span className="font-medium text-neutral-700 ml-1">{activeCourseName}</span>
              </p>
            )}
            {activeChannel === 'general' && (
              <p className="text-sm text-neutral-500 mb-4 flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                Posting in <span className="font-medium text-neutral-700 ml-1">General</span>
              </p>
            )}
            <form onSubmit={handleCreateTopic} className="space-y-4">
              {newTopicError ? (
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{newTopicError}</span>
                </div>
              ) : null}
              <Input
                type="text"
                label="Title"
                placeholder="Give your discussion a title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
              <TextArea
                label="What would you like to discuss?"
                placeholder="Write your question or topic here..."
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                required
              />
              <p className="text-sm text-neutral-500">Click the button below to publish your discussion.</p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting || !newTitle.trim() || !newBody.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Post discussion
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setShowNewTopic(false);
                    setNewTitle('');
                    setNewBody('');
                    setNewTopicError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Topics list */}
      {topicsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-800 mb-2">No discussions yet</h3>
            <p className="text-neutral-600 mb-4">
              {activeChannel === 'general'
                ? 'Start the first general topic to get the conversation going.'
                : `Start the first discussion in ${activeCourseName ?? 'this course'}.`}
            </p>
            <Button onClick={() => setShowNewTopic(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New topic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {topics.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openTopic(topic)}
            >
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-neutral-800 truncate">{topic.title}</h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500">
                    <span
                      className={`flex items-center gap-1${topic.author?.isDeleted ? ' italic text-neutral-400' : ''}`}
                      title={topic.author?.isDeleted ? 'This user has deleted their account' : undefined}
                    >
                      <User className="h-3.5 w-3" />
                      {topic.author?.name ?? 'Unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3" />
                      {topic.postCount} {topic.postCount === 1 ? 'reply' : 'replies'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3" />
                      {formatDate(topic.lastPostAt || topic.createdAt)}
                    </span>
                  </div>
                </div>
                <span className="text-accent-teal text-sm font-medium shrink-0">View →</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelTab({
  id,
  label,
  isActive,
  isGeneral,
  onClick,
}: {
  id: ChannelId;
  label: string;
  isActive: boolean;
  isGeneral: boolean;
  onClick: (id: ChannelId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={[
        'flex items-center gap-1.5 whitespace-nowrap rounded-t px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
        isActive
          ? 'border-primary-600 text-primary-700 bg-white'
          : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300',
      ].join(' ')}
    >
      {isGeneral ? (
        <Globe className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="max-w-[180px] truncate">{label}</span>
    </button>
  );
}

function ChannelBreadcrumb({
  channelName,
  isGeneral,
}: {
  channelName: string;
  isGeneral: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-4 text-sm text-neutral-500">
      {isGeneral ? (
        <Globe className="h-4 w-4 text-neutral-400" />
      ) : (
        <BookOpen className="h-4 w-4 text-neutral-400" />
      )}
      <span className="font-medium text-neutral-700">{channelName}</span>
    </div>
  );
}

function PostAuthor({
  author,
  createdAt,
}: {
  author: { name?: string; role?: string; isDeleted?: boolean };
  createdAt: string;
}) {
  const name = author?.name ?? 'Unknown';
  const role = author?.role ?? '';
  const deleted = author?.isDeleted === true;
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      <span
        className={deleted ? 'italic text-neutral-400' : 'font-medium text-neutral-700'}
        title={deleted ? 'This user has deleted their account' : undefined}
      >
        {name}
      </span>
      {role && !deleted && <><span>·</span><span className="capitalize">{role}</span></>}
      <span>·</span>
      <time dateTime={createdAt}>{formatDate(createdAt)}</time>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default Forum;
