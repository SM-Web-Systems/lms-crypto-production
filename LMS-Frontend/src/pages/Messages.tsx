import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { messageService } from '../services/messageService';
import { enrollmentService } from '../services/enrollmentService';
import { studentsService } from '../services/studentsService';
import { userDirectoryService } from '../services/userDirectoryService';
import type { Conversation, Message } from '../types/message';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { TextArea } from '../components/Input';
import { MessageCircle, Send, Plus, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Messages: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const userName = user?.name ?? 'Me';
  const isAdmin = user?.role === 'admin';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageBody, setNewMessageBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPageError(null);
      try {
        const [convs, peerList] = await Promise.all([
          messageService.getConversationsForUser(userId, isAdmin),
          enrollmentService.getPeersInMyCourses(userId, isAdmin),
        ]);
        if (!cancelled) {
          setConversations(convs);
          setPeers(peerList);
        }
      } catch (e) {
        if (!cancelled) {
          setConversations([]);
          setPeers([]);
          setPageError(getErrorMessage(e, 'Could not load messages.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !userId) return;
    (async () => {
      try {
        const r = await studentsService.getAll({ limit: 500 });
        userDirectoryService.addMany(
          r.students.map((s) => ({
            id: s.userId || s.id,
            name: s.name,
            email: s.email,
            role: 'student' as const,
          }))
        );
        const peerList = await enrollmentService.getPeersInMyCourses(userId, true);
        setPeers(peerList);
      } catch {
        // ignore
      }
    })();
  }, [isAdmin, userId]);

  const openConversationFromState = async (otherUserId: string, otherUserName: string) => {
    if (!userId) return;
    setOpeningConversation(true);
    setActionError(null);
    try {
      const conv = await messageService.getOrCreateConversation(userId, userName, otherUserId, otherUserName);
      const [convs, msgs] = await Promise.all([
        messageService.getConversationsForUser(userId, isAdmin),
        messageService.getMessages(conv.id),
      ]);
      setConversations(convs);
      setSelectedConversation(conv);
      setMessages(msgs);
      setShowNewConversation(false);
      messageService.markConversationRead(conv.id);
    } catch (e) {
      setActionError(getErrorMessage(e, 'Could not open that conversation.'));
    } finally {
      setOpeningConversation(false);
    }
  };

  useEffect(() => {
    const state = location.state as { openUserId?: string; openUserName?: string } | null;
    if (state?.openUserId && state?.openUserName && userId) {
      openConversationFromState(state.openUserId, state.openUserName);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, userId, isAdmin, userName]);

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const msgs = await messageService.getMessages(selectedConversation.id);
        if (!cancelled) setMessages(msgs);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshConversations = async () => {
    if (!userId) return;
    try {
      const convs = await messageService.getConversationsForUser(userId, isAdmin);
      setConversations(convs);
    } catch {
      // ignore
    }
  };

  const openConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowNewConversation(false);
    messageService.markConversationRead(conv.id);
  };

  const startConversationWith = (otherUserId: string, otherUserName: string) => {
    openConversationFromState(otherUserId, otherUserName);
  };

  const handleSend = async () => {
    const body = newMessageBody.trim();
    if (!body || !selectedConversation || !userId) return;
    setSending(true);
    setActionError(null);
    try {
      await messageService.sendMessage(selectedConversation.id, userId, body);
      const msgs = await messageService.getMessages(selectedConversation.id);
      setMessages(msgs);
      setNewMessageBody('');
      messageService.markConversationRead(selectedConversation.id);
      await refreshConversations();
    } catch (e) {
      setActionError(getErrorMessage(e, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
  };

  const otherUserId = selectedConversation ? messageService.getOtherDisplayName(selectedConversation, userId, isAdmin).otherUserId : null;
  const otherUserName = selectedConversation ? messageService.getOtherDisplayName(selectedConversation, userId, isAdmin).otherUserName : '';

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] rounded-xl border border-neutral-200/90 bg-white shadow-card">
        <p className="text-neutral-600 px-6">You must be signed in to view messages.</p>
      </div>
    );
  }

  const chatHeight = 'min-h-[420px] sm:min-h-[520px] lg:h-[min(560px,calc(100vh-14rem))]';

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-teal/15 text-accent-teal ring-1 ring-accent-teal/20">
            <MessageCircle className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-3xl font-bold text-neutral-800 tracking-tight">Messages</h1>
            <p className="text-neutral-600 mt-1 max-w-xl leading-relaxed">
              Direct messages with people who share a course with you. Start from the list or pick someone new.
            </p>
          </div>
        </div>
        {!showNewConversation && !selectedConversation ? (
          <Button onClick={() => setShowNewConversation(true)} className="shrink-0 self-start sm:self-center">
            <Plus className="h-4 w-4 mr-2" aria-hidden />
            New conversation
          </Button>
        ) : null}
      </div>

      {pageError ? (
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-amber-950 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold text-amber-950">Messaging may be limited</p>
            <p className="text-sm mt-1 text-amber-900/90 leading-relaxed">{pageError}</p>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-5 flex gap-2 rounded-xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 lg:gap-6">
        <Card className="lg:col-span-2 shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
          <CardContent className="p-0">
            {showNewConversation ? (
              <div>
                <div className="border-b border-neutral-200/90 bg-gradient-to-r from-accent-teal/[0.07] via-white to-neutral-50/90 px-4 py-3 sm:px-5">
                  <Button variant="outline" size="sm" onClick={() => setShowNewConversation(false)} className="mb-3 border-neutral-200/90">
                    <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
                    Back to inbox
                  </Button>
                  <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">New message</p>
                  <p className="text-sm font-semibold text-neutral-800 mt-0.5">People in your courses</p>
                </div>
                <div className="p-3 max-h-[min(360px,50vh)] lg:max-h-none overflow-y-auto">
                  {loading ? (
                    <div className="flex flex-col items-center py-10 text-neutral-500">
                      <Loader2 className="h-7 w-7 animate-spin text-accent-teal mb-2" aria-hidden />
                      <p className="text-sm">Loading people…</p>
                    </div>
                  ) : peers.length === 0 ? (
                    <p className="text-sm text-neutral-600 leading-relaxed px-2 py-4">
                      No one else in your courses yet. Ask your admin to enroll classmates so you can reach them here.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {peers.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => startConversationWith(p.id, p.name)}
                            disabled={openingConversation}
                            className="w-full flex items-center gap-3 p-3 rounded-xl text-left border border-transparent hover:bg-neutral-50 hover:border-neutral-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200/80 text-primary-dark text-xs font-bold ring-2 ring-white shadow-sm"
                              aria-hidden
                            >
                              {initials(p.name)}
                            </div>
                            <span className="font-medium text-neutral-800 truncate">{p.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-neutral-200/90 bg-gradient-to-r from-accent-teal/[0.07] via-white to-neutral-50/90 px-4 py-3 sm:px-5 flex justify-between items-center gap-2">
                  <div>
                    <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Inbox</p>
                    <p className="text-sm font-semibold text-neutral-800">Conversations</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowNewConversation(true)} className="border-neutral-200/90 shrink-0" aria-label="Start new conversation">
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <div className={`overflow-y-auto ${chatHeight} lg:max-h-[min(560px,calc(100vh-14rem))]`}>
                  {loading ? (
                    <div className="flex flex-col items-center py-12 text-neutral-500">
                      <Loader2 className="h-7 w-7 animate-spin text-accent-teal mb-2" aria-hidden />
                      <p className="text-sm">Loading conversations…</p>
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-3">
                        <MessageCircle className="h-6 w-6" aria-hidden />
                      </div>
                      <p className="text-sm text-neutral-600 leading-relaxed">
                        No threads yet. Use <strong className="font-semibold text-neutral-800">New conversation</strong> to reach someone in your courses.
                      </p>
                    </div>
                  ) : (
                    <ul>
                      {conversations.map((conv) => {
                        const { otherUserName: name } = messageService.getOtherDisplayName(conv, userId, isAdmin);
                        const active = selectedConversation?.id === conv.id;
                        return (
                          <li key={conv.id} className="border-b border-neutral-100/90 last:border-0">
                            <button
                              type="button"
                              onClick={() => openConversation(conv)}
                              className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                                active
                                  ? 'bg-accent-teal/[0.08] ring-inset ring-1 ring-accent-teal/25'
                                  : 'hover:bg-neutral-50/90'
                              }`}
                            >
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-2 ring-white ${
                                  active
                                    ? 'bg-accent-teal text-white'
                                    : 'bg-gradient-to-br from-primary-100 to-primary-200/80 text-primary-dark'
                                }`}
                                aria-hidden
                              >
                                {initials(name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`font-semibold truncate ${active ? 'text-primary-dark' : 'text-neutral-800'}`}>{name}</p>
                                <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">{formatTime(conv.updatedAt)}</p>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          {selectedConversation ? (
            <Card className={`flex flex-col ${chatHeight} shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]`}>
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <div className="border-b border-neutral-200/90 bg-gradient-to-r from-accent-teal/[0.08] via-white to-neutral-50/90 px-4 py-3 sm:px-5 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedConversation(null)}
                      className="lg:hidden shrink-0 border-neutral-200/90"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </Button>
                    <div
                      className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200/80 text-primary-dark text-xs font-bold ring-2 ring-white shadow-sm"
                      aria-hidden
                    >
                      {initials(otherUserName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Chat with</p>
                      <p className="font-semibold text-neutral-900 truncate">{otherUserName}</p>
                    </div>
                  </div>
                  {otherUserId && otherUserId !== '__admin__' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-neutral-200/90"
                      onClick={() =>
                        navigate(user?.role === 'admin' ? `/admin/profile/${otherUserId}` : `/student/profile/${otherUserId}`)
                      }
                    >
                      Profile
                    </Button>
                  ) : null}
                </div>
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-neutral-50/40 bg-[length:24px_24px] bg-[linear-gradient(to_right,rgb(15_26_31/0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_26_31/0.03)_1px,transparent_1px)]">
                  {messages.map((m) => {
                    const mine = m.senderId === userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[min(100%,28rem)] rounded-2xl px-4 py-2.5 shadow-sm ${
                            mine
                              ? 'rounded-br-md bg-accent-teal text-white'
                              : 'rounded-bl-md bg-white text-neutral-800 border border-neutral-200/90 ring-1 ring-neutral-900/[0.04]'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>
                          <p
                            className={`text-[11px] mt-1.5 tabular-nums ${mine ? 'text-white/75' : 'text-neutral-500'}`}
                          >
                            {formatTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-4 sm:p-5 border-t border-neutral-200/90 bg-white shrink-0">
                  <div className="flex gap-2 items-end rounded-xl border border-neutral-200/90 bg-neutral-50/50 p-2 ring-1 ring-neutral-900/[0.03] focus-within:ring-2 focus-within:ring-accent-teal/25 focus-within:border-accent-teal/30">
                    <TextArea
                      placeholder="Write a message…"
                      value={newMessageBody}
                      onChange={(e) => setNewMessageBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      rows={2}
                      className="flex-1 resize-none border-0 bg-transparent shadow-none focus:ring-0 px-2 py-1.5"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={sending || !newMessageBody.trim()}
                      className="shrink-0 h-10 w-10 sm:h-auto sm:w-auto sm:px-4 p-0 sm:gap-2 rounded-lg"
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-2 px-0.5">Enter to send · Shift+Enter for a new line</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className={`${chatHeight} flex items-center justify-center shadow-updraft ring-1 ring-neutral-900/[0.04] border-dashed`}>
              <CardContent className="text-center px-6 py-10 max-w-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-teal/10 text-accent-teal mb-4 ring-1 ring-accent-teal/20">
                  <MessageCircle className="h-7 w-7" aria-hidden />
                </div>
                <p className="font-semibold text-neutral-800">
                  {openingConversation ? 'Opening conversation…' : 'Your inbox is ready'}
                </p>
                <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                  {openingConversation
                    ? 'Hang tight while we load the thread.'
                    : 'Choose a conversation on the left, or start a new one with someone in your courses.'}
                </p>
                {openingConversation ? (
                  <Loader2 className="h-6 w-6 animate-spin text-accent-teal mx-auto mt-4" aria-hidden />
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;
