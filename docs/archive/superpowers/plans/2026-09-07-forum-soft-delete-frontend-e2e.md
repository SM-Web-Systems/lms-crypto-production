# Forum Soft-Delete Frontend + E2E Implementation Plan (Loop 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete buttons, confirmation dialogs, and tombstone rendering to the forum UI, then add E2E tests covering the full soft-delete lifecycle.

**Architecture:** Extend `Forum.tsx` with delete actions (ConfirmDialog pattern already exists), tombstone rendering for `isDeleted` items, and a `deletePost` method in `forumService.ts`. Update `forum.ts` types to include `isDeleted`. E2E tests use the existing Playwright API-based pattern (register → act → assert via HTTP, no browser DOM needed).

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library (frontend tests), Playwright (E2E), lucide-react icons, existing ConfirmDialog component.

## Global Constraints

- Branch: `feat/forum-soft-delete` (continue existing branch, do not create child branch)
- Do NOT change CRM, AmmaWallet, or any backend files
- All existing tests must continue to pass (1401 backend, 229+ frontend, 14+ E2E)
- Follow existing patterns: `vi.mock()` for service mocking, `data-testid` for test queries
- LMS project root: `/home/webadmin/web-stack/html/LMS-AmmaWallet/`
- Frontend root: `LMS-Frontend/`
- E2E root: `e2e/`
- Run frontend tests: `cd LMS-Frontend && npx vitest run`
- Run E2E tests: `cd e2e && npx playwright test`
- Run typecheck: `cd LMS-Frontend && npx tsc --noEmit`

---

### Task 1: Update Types + ForumService (deletePost method + isDeleted fields)

**Files:**
- Modify: `LMS-Frontend/src/types/forum.ts`
- Modify: `LMS-Frontend/src/services/forumService.ts`

**Interfaces:**
- Consumes: existing `api` axios instance, `assertApiOk`
- Produces: `ForumTopic.isDeleted?: boolean`, `ForumPost.isDeleted?: boolean`, `forumService.deletePost(id: string): Promise<void>`

- [ ] **Step 1: Add `isDeleted` to ForumTopic and ForumPost types**

In `LMS-Frontend/src/types/forum.ts`, add `isDeleted?: boolean` to both interfaces:

```typescript
export interface ForumTopic {
  id: string;
  title: string;
  body: string;
  /** null / undefined = General channel */
  courseId?: string | null;
  author: ForumAuthor;
  createdAt: string; // ISO
  updatedAt?: string;
  postCount: number; // denormalized for list view
  lastPostAt?: string; // ISO, for sorting
  isDeleted?: boolean;
}

export interface ForumPost {
  id: string;
  topicId: string;
  body: string;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
  isDeleted?: boolean;
}
```

- [ ] **Step 2: Add `deletePost` to forumService**

In `LMS-Frontend/src/services/forumService.ts`, add after the existing `deleteTopic` method:

```typescript
  async deletePost(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<unknown>>(`/forum/posts/${id}`);
    assertApiOk(res, 'Could not delete the reply.');
  },
```

- [ ] **Step 3: Run typecheck**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/types/forum.ts LMS-Frontend/src/services/forumService.ts
git commit -m "feat(forum-fe): add isDeleted type fields and deletePost service method"
```

---

### Task 2: Forum.tsx — Tombstone Rendering + Delete UX

**Files:**
- Modify: `LMS-Frontend/src/pages/Forum.tsx`

**Interfaces:**
- Consumes: `ForumTopic.isDeleted`, `ForumPost.isDeleted`, `forumService.deleteTopic(id)`, `forumService.deletePost(id)`, `ConfirmDialog` component, `useAuth().user.id`
- Produces: Tombstone rendering for deleted topics/posts, delete buttons for own content, confirmation dialogs

This is the main UI task. Changes to Forum.tsx:

1. Import `ConfirmDialog` and `Trash2` icon
2. Add state for delete confirmation (which item, loading, error)
3. In topic list: render tombstones for `isDeleted` topics, show delete button for own non-deleted topics
4. In thread view: render tombstones for deleted posts, show delete button for own posts, handle deleted topic (back to list)
5. Block reply form when topic is deleted

- [ ] **Step 1: Add imports and delete state**

Add these imports at the top of `Forum.tsx`:

```typescript
import ConfirmDialog from '../components/ConfirmDialog';
```

Add `Trash2` to the lucide-react import:

```typescript
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
  Trash2,
} from 'lucide-react';
```

Add delete state inside the `Forum` component, after the existing state declarations (after line ~53):

```typescript
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'topic' | 'post'; id: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

- [ ] **Step 2: Add delete handler function**

Add this handler after `handleReply`, before `openTopic`:

```typescript
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      if (deleteTarget.type === 'topic') {
        await forumService.deleteTopic(deleteTarget.id);
        // If we're viewing this topic, go back to list
        if (selectedTopic?.id === deleteTarget.id) {
          setSelectedTopic(null);
          setPosts([]);
        }
        await loadTopics(activeChannel);
      } else {
        await forumService.deletePost(deleteTarget.id);
        // Refresh posts in current thread
        if (selectedTopic) {
          const updatedPosts = await forumService.getPosts(selectedTopic.id);
          setPosts(Array.isArray(updatedPosts) ? updatedPosts : []);
          await loadTopics(activeChannel);
        }
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not delete. Please try again.'));
    } finally {
      setDeleteLoading(false);
    }
  };
```

- [ ] **Step 3: Update topic list rendering with tombstones and delete buttons**

Replace the topic list mapping block (the `topics.map((topic) => (...))` section, lines ~450-481) with:

```typescript
        <div className="space-y-3">
          {topics.map((topic) =>
            topic.isDeleted ? (
              <Card key={topic.id} data-testid="topic-tombstone">
                <CardContent className="p-4">
                  <p className="text-sm italic text-neutral-400">This topic was removed</p>
                  <div className="flex items-center gap-4 mt-1 text-sm text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3" />
                      {formatDate(topic.createdAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : (
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
                  <div className="flex items-center gap-2 shrink-0">
                    {user && topic.author?.id === user.id && (
                      <button
                        type="button"
                        data-testid={`delete-topic-${topic.id}`}
                        className="p-1.5 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete topic"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setDeleteTarget({ type: 'topic', id: topic.id });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <span className="text-accent-teal text-sm font-medium">View →</span>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
```

- [ ] **Step 4: Update thread view — topic header handles deleted state**

In the thread view section (the `if (selectedTopic)` block), update the topic Card to handle deleted state. Replace the topic header Card (lines ~197-204) with:

```typescript
          <Card>
            <CardContent className="p-6">
              {selectedTopic.isDeleted ? (
                <div data-testid="topic-tombstone">
                  <p className="text-base italic text-neutral-400">This topic has been removed.</p>
                  <PostAuthor author={author} createdAt={selectedTopic.createdAt} />
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="text-2xl font-bold text-neutral-800 mb-2">{selectedTopic.title}</h1>
                    {user && selectedTopic.author?.id === user.id && (
                      <button
                        type="button"
                        data-testid={`delete-topic-${selectedTopic.id}`}
                        className="p-1.5 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        title="Delete topic"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget({ type: 'topic', id: selectedTopic.id });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <PostAuthor author={author} createdAt={selectedTopic.createdAt} />
                  <div className="mt-4 text-neutral-700 whitespace-pre-wrap">{selectedTopic.body}</div>
                </>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 5: Update post list rendering with tombstones and delete buttons**

Replace the posts mapping block (lines ~221-232) with:

```typescript
          <div className="space-y-4 mb-8">
            {posts.map((post) =>
              post.isDeleted ? (
                <Card key={post.id} data-testid="post-tombstone">
                  <CardContent className="p-4">
                    <p className="text-sm italic text-neutral-400">This reply was removed</p>
                    <div className="mt-1 text-sm text-neutral-400">
                      <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card key={post.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <PostAuthor
                        author={post.author ?? { name: 'Unknown', role: 'student', isDeleted: false }}
                        createdAt={post.createdAt}
                      />
                      {user && post.author?.id === user.id && (
                        <button
                          type="button"
                          data-testid={`delete-post-${post.id}`}
                          className="p-1.5 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Delete reply"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ type: 'post', id: post.id });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 text-neutral-700 whitespace-pre-wrap">{post.body}</div>
                  </CardContent>
                </Card>
              )
            )}
          </div>
```

- [ ] **Step 6: Hide reply form when topic is deleted**

Wrap the reply form Card (the final `<Card>` in the thread view, containing "Add a reply") with a condition. Replace lines ~235-256 with:

```typescript
        {selectedTopic.isDeleted ? (
          <Card>
            <CardContent className="p-4 text-center text-sm text-neutral-400 italic">
              Replies are disabled — this topic has been removed.
            </CardContent>
          </Card>
        ) : (
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
        )}
```

- [ ] **Step 7: Add ConfirmDialog and delete error banner**

Add the ConfirmDialog and error banner at the very end of the component, just before the closing `</div>` of each view (both list view and thread view). The simplest approach: add them once at the end of the component's return, wrapping both views in a fragment.

Actually, the component returns early for thread view. So add ConfirmDialog + error in both returns. Add this block just before the final `</div>` in **both** the thread view return (line ~257) and the list view return (line ~483):

```typescript
        {/* Delete error banner */}
        {deleteError && (
          <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{deleteError}</span>
          </div>
        )}

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          isOpen={deleteTarget !== null}
          title={deleteTarget?.type === 'topic' ? 'Delete this topic?' : 'Delete this reply?'}
          description={
            deleteTarget?.type === 'topic'
              ? 'This will remove the topic and all replies from the forum. Original content will remain visible only to admins for audit purposes.'
              : 'This reply will be removed from the forum. Admins can still see the original content for audit purposes.'
          }
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleteLoading) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
        />
```

- [ ] **Step 8: Run typecheck**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/Forum.tsx
git commit -m "feat(forum-fe): add delete buttons, confirmation dialogs, and tombstone rendering"
```

---

### Task 3: Frontend Tests for Forum Soft-Delete

**Files:**
- Create: `LMS-Frontend/src/__tests__/components/ForumSoftDelete.test.tsx`

**Interfaces:**
- Consumes: `Forum` component, mocked `forumService`, mocked `useAuth`, mocked `courseService`
- Produces: 6 test cases (FE-F01 through FE-F06)

- [ ] **Step 1: Write all frontend tests**

Create `LMS-Frontend/src/__tests__/components/ForumSoftDelete.test.tsx`:

```typescript
/**
 * Forum Soft-Delete — frontend tests for tombstone rendering and delete UX.
 *
 * FE-F01: Delete button shown for own topics, hidden for others'
 * FE-F02: Delete button shown for own posts, hidden for others'
 * FE-F03: Confirming delete calls API and renders tombstone on success
 * FE-F04: Error handling: failed delete shows error, state unchanged
 * FE-F05: Tombstone rendering in topic list for deleted topics
 * FE-F06: Tombstone rendering in post list for deleted posts
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const CURRENT_USER = { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'student' };

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: CURRENT_USER }),
}));

const mockGetTopics = vi.fn();
const mockGetTopic = vi.fn();
const mockGetPosts = vi.fn();
const mockDeleteTopic = vi.fn();
const mockDeletePost = vi.fn();

vi.mock('../../services/forumService', () => ({
  forumService: {
    getTopics: (...args: unknown[]) => mockGetTopics(...args),
    getTopic: (...args: unknown[]) => mockGetTopic(...args),
    getPosts: (...args: unknown[]) => mockGetPosts(...args),
    createTopic: vi.fn(),
    createPost: vi.fn(),
    deleteTopic: (...args: unknown[]) => mockDeleteTopic(...args),
    deletePost: (...args: unknown[]) => mockDeletePost(...args),
  },
}));

vi.mock('../../services/courseService', () => ({
  courseService: {
    fetchCourses: vi.fn().mockResolvedValue([]),
  },
}));

import Forum from '../../pages/Forum';

// --- Fixtures ---

function makeTopic(overrides: Partial<{
  id: string; title: string; body: string; authorId: string; authorName: string; isDeleted: boolean;
}> = {}) {
  const id = overrides.id ?? 'topic-1';
  return {
    id,
    title: overrides.isDeleted ? null : (overrides.title ?? 'Test Topic'),
    body: overrides.isDeleted ? null : (overrides.body ?? 'Topic body text'),
    courseId: null,
    author: {
      id: overrides.authorId ?? 'user-1',
      name: overrides.authorName ?? 'Alice',
      email: 'alice@test.com',
      role: 'student' as const,
    },
    createdAt: '2026-09-06T12:00:00Z',
    postCount: 0,
    lastPostAt: null,
    isDeleted: overrides.isDeleted ?? false,
  };
}

function makePost(overrides: Partial<{
  id: string; body: string; authorId: string; authorName: string; isDeleted: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'post-1',
    topicId: 'topic-1',
    body: overrides.isDeleted ? null : (overrides.body ?? 'Post body text'),
    author: {
      id: overrides.authorId ?? 'user-1',
      name: overrides.authorName ?? 'Alice',
      email: 'alice@test.com',
      role: 'student' as const,
    },
    createdAt: '2026-09-06T12:05:00Z',
    isDeleted: overrides.isDeleted ?? false,
  };
}

// --- Tests ---

describe('Forum Soft-Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTopics.mockResolvedValue([]);
    mockGetPosts.mockResolvedValue([]);
  });

  describe('FE-F01: Delete button visibility — topics', () => {
    it('shows delete button on own topics', async () => {
      const ownTopic = makeTopic({ id: 'own-topic', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([ownTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-own-topic')).toBeTruthy();
      });
    });

    it('hides delete button on other users\' topics', async () => {
      const otherTopic = makeTopic({ id: 'other-topic', authorId: 'user-2', authorName: 'Bob' });
      mockGetTopics.mockResolvedValue([otherTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });

      expect(screen.queryByTestId('delete-topic-other-topic')).toBeNull();
    });
  });

  describe('FE-F02: Delete button visibility — posts', () => {
    it('shows delete button on own posts in thread view', async () => {
      const topic = makeTopic({ id: 'topic-1' });
      const ownPost = makePost({ id: 'own-post', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([ownPost]);

      render(<Forum />);

      // Click to open topic
      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-post-own-post')).toBeTruthy();
      });
    });

    it('hides delete button on other users\' posts', async () => {
      const topic = makeTopic({ id: 'topic-1' });
      const otherPost = makePost({ id: 'other-post', authorId: 'user-2', authorName: 'Bob' });
      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([otherPost]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByText('Post body text')).toBeTruthy();
      });

      expect(screen.queryByTestId('delete-post-other-post')).toBeNull();
    });
  });

  describe('FE-F03: Confirming delete calls API and renders tombstone', () => {
    it('deleting own topic calls API and refreshes list with tombstone', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-1' });
      mockGetTopics.mockResolvedValueOnce([topic]);
      mockDeleteTopic.mockResolvedValue(undefined);
      // After delete, the topic comes back as deleted
      const deletedTopic = makeTopic({ id: 'topic-1', authorId: 'user-1', isDeleted: true });
      mockGetTopics.mockResolvedValueOnce([deletedTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-topic-1')).toBeTruthy();
      });

      // Click delete button
      await userEvent.click(screen.getByTestId('delete-topic-topic-1'));

      // Confirm dialog should appear
      await waitFor(() => {
        expect(screen.getByText('Delete this topic?')).toBeTruthy();
      });

      // Click Delete in dialog
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockDeleteTopic).toHaveBeenCalledWith('topic-1');
      });

      // After reload, tombstone should appear
      await waitFor(() => {
        expect(screen.getByTestId('topic-tombstone')).toBeTruthy();
        expect(screen.getByText('This topic was removed')).toBeTruthy();
      });
    });
  });

  describe('FE-F04: Error handling on failed delete', () => {
    it('failed topic delete shows error and does not alter state', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-1' });
      mockGetTopics.mockResolvedValue([topic]);
      mockDeleteTopic.mockRejectedValue(new Error('Server error'));

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByTestId('delete-topic-topic-1')).toBeTruthy();
      });

      await userEvent.click(screen.getByTestId('delete-topic-topic-1'));

      await waitFor(() => {
        expect(screen.getByText('Delete this topic?')).toBeTruthy();
      });

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      // Error should appear, topic title still visible
      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeTruthy();
      });

      expect(screen.getByText('Test Topic')).toBeTruthy();
    });
  });

  describe('FE-F05: Tombstone rendering — topic list', () => {
    it('deleted topics render as tombstones with no title/body', async () => {
      const activeTopic = makeTopic({ id: 'active', authorId: 'user-2', authorName: 'Bob', title: 'Active Topic' });
      const deletedTopic = makeTopic({ id: 'deleted', authorId: 'user-1', isDeleted: true });

      mockGetTopics.mockResolvedValue([activeTopic, deletedTopic]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Active Topic')).toBeTruthy();
      });

      const tombstone = screen.getByTestId('topic-tombstone');
      expect(tombstone).toBeTruthy();
      expect(within(tombstone).getByText('This topic was removed')).toBeTruthy();

      // No delete button on tombstone
      expect(within(tombstone).queryByRole('button')).toBeNull();
    });
  });

  describe('FE-F06: Tombstone rendering — post list', () => {
    it('deleted posts render as tombstones with no body', async () => {
      const topic = makeTopic({ id: 'topic-1', authorId: 'user-2', authorName: 'Bob' });
      const activePost = makePost({ id: 'active-post', authorId: 'user-2', authorName: 'Bob', body: 'Active reply' });
      const deletedPost = makePost({ id: 'deleted-post', authorId: 'user-1', isDeleted: true });

      mockGetTopics.mockResolvedValue([topic]);
      mockGetTopic.mockResolvedValue(topic);
      mockGetPosts.mockResolvedValue([activePost, deletedPost]);

      render(<Forum />);

      await waitFor(() => {
        expect(screen.getByText('Test Topic')).toBeTruthy();
      });
      await userEvent.click(screen.getByText('Test Topic'));

      await waitFor(() => {
        expect(screen.getByText('Active reply')).toBeTruthy();
      });

      const tombstone = screen.getByTestId('post-tombstone');
      expect(tombstone).toBeTruthy();
      expect(within(tombstone).getByText('This reply was removed')).toBeTruthy();

      // No delete button on tombstone
      expect(within(tombstone).queryByRole('button')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run frontend tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/components/ForumSoftDelete.test.tsx`
Expected: 8 tests PASS (FE-F01 through FE-F06, some with 2 cases)

- [ ] **Step 3: Run full frontend test suite to check regressions**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
Expected: All tests PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/__tests__/components/ForumSoftDelete.test.tsx
git commit -m "test(forum-fe): add frontend tests for delete UX and tombstone rendering (FE-F01–F06)"
```

---

### Task 4: E2E Tests for Forum Soft-Delete

**Files:**
- Create: `e2e/tests/forum-soft-delete.spec.ts`

**Interfaces:**
- Consumes: Backend API endpoints (`DELETE /forum/topics/:id`, `DELETE /forum/posts/:id`, `DELETE /forum/admin/topics/:id`, `GET /forum/topics`, `GET /forum/topics/:topicId/posts`)
- Produces: 4 E2E test cases (E2E-F01 through E2E-F04)

These are API-level E2E tests following the existing `message-soft-delete.spec.ts` pattern.

- [ ] **Step 1: Write E2E test file**

Create `e2e/tests/forum-soft-delete.spec.ts`:

```typescript
/**
 * E2E: Forum Soft-Delete — API-based tests for topic/post deletion and tombstone rendering.
 *
 * E2E-F01: Author deletes own topic → re-fetch shows tombstone
 * E2E-F02: Cannot delete another user's topic → 403
 * E2E-F03: Author deletes own reply → re-fetch shows tombstone
 * E2E-F04: Reply to deleted topic fails → 403
 */

import { test, expect } from '@playwright/test';
import { apiURL } from '../playwright.config';

const API = `${apiURL}/api/v1`;

/** Register a fresh user and return { token, userId, name, email }. */
async function registerAndLogin(request: any, suffix: string) {
  const email = `e2e-forumdel-${suffix}-${Date.now()}@test.com`;
  const password = 'TestPass123!';
  const name = `E2E ForumDel ${suffix}`;

  const regRes = await request.post(`${API}/auth/register`, {
    data: { name, email, password },
  });
  expect([200, 201]).toContain(regRes.status());

  const loginRes = await request.post(`${API}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const body = await loginRes.json();
  const token = body.data?.token ?? body.token;
  expect(token).toBeTruthy();

  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const userId = payload.userId ?? payload.sub ?? payload.id;

  return { token, userId, name, email };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('Forum Soft-Delete', () => {
  test('E2E-F01: author can delete own topic, re-fetch shows tombstone', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice');

    // Create a topic
    const createRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'E2E Delete Topic', body: 'This topic will be deleted', courseId: null },
    });
    expect(createRes.ok()).toBeTruthy();
    const topic = (await createRes.json()).data;
    const topicId = topic.id;

    // Delete the topic
    const delRes = await request.delete(`${API}/forum/topics/${topicId}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();
    const delBody = await delRes.json();
    expect(delBody.data.deleted).toBe(true);

    // Re-fetch topic list — should include tombstone
    const listRes = await request.get(`${API}/forum/topics?courseId=general`, {
      headers: auth(alice.token),
    });
    expect(listRes.ok()).toBeTruthy();
    const topics = (await listRes.json()).data.topics;
    const deleted = topics.find((t: any) => t.id === topicId);
    expect(deleted).toBeTruthy();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.title).toBeNull();
    expect(deleted.body).toBeNull();

    // Fetching the topic directly should return 404
    const getRes = await request.get(`${API}/forum/topics/${topicId}`, {
      headers: auth(alice.token),
    });
    expect(getRes.status()).toBe(404);
  });

  test('E2E-F02: cannot delete another user\'s topic', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice2');
    const bob = await registerAndLogin(request, 'bob2');

    // Alice creates a topic
    const createRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Alice Only Topic', body: 'Bob cannot delete this' },
    });
    expect(createRes.ok()).toBeTruthy();
    const topic = (await createRes.json()).data;

    // Bob tries to delete Alice's topic — should fail
    const delRes = await request.delete(`${API}/forum/topics/${topic.id}`, {
      headers: auth(bob.token),
    });
    expect(delRes.status()).toBe(403);

    // Topic should still be intact
    const getRes = await request.get(`${API}/forum/topics/${topic.id}`, {
      headers: auth(alice.token),
    });
    expect(getRes.ok()).toBeTruthy();
    const intact = (await getRes.json()).data;
    expect(intact.title).toBe('Alice Only Topic');
  });

  test('E2E-F03: author can delete own reply, re-fetch shows tombstone', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice3');

    // Create a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Topic for Reply Delete', body: 'Testing reply deletion' },
    });
    expect(topicRes.ok()).toBeTruthy();
    const topic = (await topicRes.json()).data;

    // Create a reply
    const replyRes = await request.post(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(alice.token),
      data: { body: 'This reply will be deleted' },
    });
    expect(replyRes.ok()).toBeTruthy();
    const post = (await replyRes.json()).data;

    // Delete the reply
    const delRes = await request.delete(`${API}/forum/posts/${post.id}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Re-fetch posts — should include tombstone
    const postsRes = await request.get(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(alice.token),
    });
    expect(postsRes.ok()).toBeTruthy();
    const posts = (await postsRes.json()).data.posts;
    const deleted = posts.find((p: any) => p.id === post.id);
    expect(deleted).toBeTruthy();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.body).toBeNull();
  });

  test('E2E-F04: reply to deleted topic fails with 403', async ({ request }) => {
    const alice = await registerAndLogin(request, 'alice4');
    const bob = await registerAndLogin(request, 'bob4');

    // Alice creates a topic
    const topicRes = await request.post(`${API}/forum/topics`, {
      headers: auth(alice.token),
      data: { title: 'Topic to be deleted', body: 'Will be deleted before reply' },
    });
    expect(topicRes.ok()).toBeTruthy();
    const topic = (await topicRes.json()).data;

    // Alice deletes the topic
    const delRes = await request.delete(`${API}/forum/topics/${topic.id}`, {
      headers: auth(alice.token),
    });
    expect(delRes.ok()).toBeTruthy();

    // Bob tries to reply — should fail with 403
    const replyRes = await request.post(`${API}/forum/topics/${topic.id}/posts`, {
      headers: auth(bob.token),
      data: { body: 'Trying to reply to deleted topic' },
    });
    expect(replyRes.status()).toBe(403);
  });
});
```

- [ ] **Step 2: Run E2E tests (forum only)**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test tests/forum-soft-delete.spec.ts`
Expected: 4 tests PASS

- [ ] **Step 3: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add e2e/tests/forum-soft-delete.spec.ts
git commit -m "test(forum-e2e): add E2E tests for forum soft-delete lifecycle (E2E-F01–F04)"
```

---

### Task 5: Update TODO + Final Verification

**Files:**
- Modify: `notes/forum-deletion-todo.md`

**Interfaces:**
- Consumes: All prior tasks' output
- Produces: Updated TODO checklist, verification results

- [ ] **Step 1: Run full verification suite**

Run all four checks:

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```
Expected: 1401/1401 PASS

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```
Expected: All PASS (including new ForumSoftDelete tests)

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```
Expected: PASS

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test
```
Expected: All PASS (including new forum-soft-delete tests)

- [ ] **Step 2: Update the TODO checklist**

Update `notes/forum-deletion-todo.md` — mark all Loop 10 items as done and add verification results. Replace the "Frontend — Delete UX (Loop 10)" section and below with checked items. Add a new verification section:

```markdown
## Loop 10 Verification Results (2026-09-07)

- **Backend tests:** 1401/1401 pass (no regressions)
- **Frontend tests:** ALL pass (6 new forum soft-delete tests: FE-F01–F06)
- **TypeScript typecheck:** PASS
- **E2E tests:** ALL pass (4 new forum soft-delete tests: E2E-F01–F04)
- **Commits:** Tasks 1–5 complete on branch `feat/forum-soft-delete`
```

Mark these items as done:
- `[x]` all items under "Frontend — Delete UX (Loop 10)"
- `[x]` all items under "Frontend — Tombstone Rendering (Loop 10)"
- `[x]` all items under "Frontend Tests (Loop 10)"
- `[x]` all items under "E2E Tests (Loop 10)"

- [ ] **Step 3: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add notes/forum-deletion-todo.md
git commit -m "docs: update forum-deletion-todo with Loop 10 completion status"
```
