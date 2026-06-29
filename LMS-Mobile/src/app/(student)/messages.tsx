import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { messageService } from '@/services/messageService';
import { enrollmentService } from '@/services/enrollmentService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import type { Conversation, Message } from '@/types/message';
import { formatTime } from '@/utils/format';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const userName = user?.name ?? 'Me';
  const isAdmin = user?.role === 'admin';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [newMessageBody, setNewMessageBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
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
        if (!cancelled) setError(getErrorMessage(e, 'Could not load messages.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }
    messageService.getMessages(selectedConversation.id).then(setMessages).catch(() => setMessages([]));
    messageService.markConversationRead(selectedConversation.id);
  }, [selectedConversation]);

  const openConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowNewConversation(false);
    messageService.markConversationRead(conv.id);
  };

  const startConversationWith = async (otherUserId: string, otherUserName: string) => {
    if (!userId) return;
    try {
      const conv = await messageService.getOrCreateConversation(userId, userName, otherUserId);
      const convs = await messageService.getConversationsForUser(userId, isAdmin);
      setConversations(convs);
      setSelectedConversation(conv);
      setShowNewConversation(false);
      const msgs = await messageService.getMessages(conv.id);
      setMessages(msgs);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not open conversation.'));
    }
  };

  const handleSend = async () => {
    const body = newMessageBody.trim();
    if (!body || !selectedConversation || !userId) return;
    setSending(true);
    try {
      await messageService.sendMessage(selectedConversation.id, userId, body);
      const msgs = await messageService.getMessages(selectedConversation.id);
      setMessages(msgs);
      setNewMessageBody('');
      const convs = await messageService.getConversationsForUser(userId, isAdmin);
      setConversations(convs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not send message.'));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingView message="Loading messages…" />;

  if (selectedConversation) {
    const { otherUserName } = messageService.getOtherDisplayName(selectedConversation, userId, isAdmin);
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-neutral-50">
        <View className="border-b border-neutral-200 bg-white px-4 py-3 flex-row items-center gap-3">
          <Pressable onPress={() => setSelectedConversation(null)}>
            <Ionicons name="arrow-back" size={22} color={brand.primary.dark} />
          </Pressable>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-teal/20">
            <Text className="text-xs font-bold text-accent-teal">{initials(otherUserName)}</Text>
          </View>
          <Text className="flex-1 font-bold text-neutral-900">{otherUserName}</Text>
        </View>
        <ScrollView ref={scrollRef} className="flex-1 px-4 py-3" contentContainerClassName="gap-2 pb-4">
          {messages.map((msg) => {
            const mine = msg.senderId === userId;
            return (
              <View key={msg.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'self-end bg-accent-teal' : 'self-start bg-white border border-neutral-200'}`}>
                <Text className={`text-sm ${mine ? 'text-white' : 'text-neutral-800'}`}>{msg.body}</Text>
                <Text className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>{formatTime(msg.createdAt)}</Text>
              </View>
            );
          })}
        </ScrollView>
        <View className="border-t border-neutral-200 bg-white p-3 gap-2">
          <Input value={newMessageBody} onChangeText={setNewMessageBody} placeholder="Write a message…" multiline />
          <Button label={sending ? 'Sending…' : 'Send'} onPress={handleSend} disabled={sending || !newMessageBody.trim()} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-3 pb-8">
      {error ? <ErrorBanner message={error} /> : null}
      <Button label={showNewConversation ? 'Cancel' : 'New message'} variant="outline" onPress={() => setShowNewConversation((v) => !v)} />

      {showNewConversation ? (
        <Card>
          <Text className="mb-2 font-semibold text-neutral-800">Message a classmate</Text>
          {peers.length === 0 ? (
            <Text className="text-sm text-neutral-500">No classmates available yet.</Text>
          ) : (
            peers.map((peer) => (
              <Pressable
                key={peer.id}
                onPress={() => startConversationWith(peer.id, peer.name)}
                className="flex-row items-center gap-3 border-b border-neutral-100 py-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-50">
                  <Text className="text-xs font-bold text-accent-teal">{initials(peer.name)}</Text>
                </View>
                <Text className="font-medium text-neutral-900">{peer.name}</Text>
              </Pressable>
            ))
          )}
        </Card>
      ) : null}

      {conversations.length === 0 ? (
        <EmptyState icon="mail-outline" title="No conversations yet" message="Start a new message with a classmate." />
      ) : (
        conversations.map((conv) => {
          const { otherUserName } = messageService.getOtherDisplayName(conv, userId, isAdmin);
          return (
            <Pressable key={conv.id} onPress={() => openConversation(conv)} className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-90">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-accent-teal/15">
                <Text className="text-sm font-bold text-accent-teal">{initials(otherUserName)}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-neutral-900">{otherUserName}</Text>
                <Text className="text-xs text-neutral-400">{formatTime(conv.updatedAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={brand.neutral[400]} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
