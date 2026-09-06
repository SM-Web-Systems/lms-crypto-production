import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { ShieldAlert, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { messageAuditService } from '../services/messageAuditService';
import type { AdminConversation, AdminMessage } from '../types/message';

type PanelState = 'loading' | 'error' | 'empty' | 'data';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function senderLabel(msg: AdminMessage): string {
  if (msg.senderName) return msg.senderName;
  if (msg.originalSenderName) return 'Deleted User';
  return 'Unknown';
}

export function MessageAuditPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [state, setState] = useState<PanelState>('loading');
  const [selectedConv, setSelectedConv] = useState<AdminConversation | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [messagesState, setMessagesState] = useState<PanelState>('loading');

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  function load() {
    setState('loading');
    messageAuditService
      .getConversations()
      .then((result) => {
        setConversations(result);
        setState(result.length === 0 ? 'empty' : 'data');
      })
      .catch(() => {
        setState('error');
      });
  }

  function openConversation(conv: AdminConversation) {
    setSelectedConv(conv);
    setMessagesState('loading');
    messageAuditService
      .getConversationMessages(conv.id)
      .then((result) => {
        setMessages(result);
        setMessagesState(result.length === 0 ? 'empty' : 'data');
      })
      .catch(() => {
        setMessagesState('error');
      });
  }

  function goBack() {
    setSelectedConv(null);
    setMessages([]);
  }

  if (!isAdmin) {
    return (
      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <CardContent className="p-6 text-center">
          <ShieldAlert className="h-8 w-8 text-red-500 mx-auto mb-2" aria-hidden />
          <p className="text-sm font-medium text-red-700">Access denied</p>
          <p className="text-xs text-neutral-500 mt-1">You do not have permission to view this panel.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-red-50/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Message audit</CardTitle>
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          Admin audit view — deleted message content is visible. Handle with care.
        </p>
      </div>
      <CardContent className="p-4 sm:p-6">
        {selectedConv ? (
          <ConversationDetail
            conv={selectedConv}
            messages={messages}
            state={messagesState}
            onBack={goBack}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            state={state}
            onSelect={openConversation}
            onRetry={load}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ConversationList({
  conversations,
  state,
  onSelect,
  onRetry,
}: {
  conversations: AdminConversation[];
  state: PanelState;
  onSelect: (c: AdminConversation) => void;
  onRetry: () => void;
}) {
  if (state === 'loading') {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" aria-hidden />
        <p className="text-sm text-neutral-700 font-medium">Could not load conversations</p>
        <Button variant="outline" size="sm" type="button" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-neutral-500">No conversations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          type="button"
          onClick={() => onSelect(conv)}
          className="w-full text-left rounded-lg border border-neutral-200/80 px-4 py-3 hover:bg-neutral-50 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                <span>{conv.participantNames[0]}</span>
                <span className="text-neutral-400 mx-1">&harr;</span>
                <span>{conv.participantNames[1]}</span>
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {conv.messageCount} messages
                {conv.deletedMessageCount > 0 && (
                  <span className="ml-2 text-red-600 font-medium">{conv.deletedMessageCount} deleted</span>
                )}
              </p>
            </div>
            <p className="text-xs text-neutral-400 shrink-0">{formatDate(conv.updatedAt)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ConversationDetail({
  conv,
  messages,
  state,
  onBack,
}: {
  conv: AdminConversation;
  messages: AdminMessage[];
  state: PanelState;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" type="button" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden />
          Back
        </Button>
        <p className="text-sm font-medium text-neutral-900">
          {conv.participantNames[0]} &harr; {conv.participantNames[1]}
        </p>
      </div>

      {state === 'loading' && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded bg-neutral-100" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="text-center py-8">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" aria-hidden />
          <p className="text-sm text-neutral-700 font-medium">Could not load messages</p>
        </div>
      )}

      {state === 'empty' && (
        <div className="text-center py-8">
          <p className="text-sm text-neutral-500">No messages in this conversation.</p>
        </div>
      )}

      {state === 'data' && (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg border px-4 py-3 ${
                msg.isDeleted
                  ? 'border-red-200/80 bg-red-50/40'
                  : 'border-neutral-200/80 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-neutral-900">
                  {senderLabel(msg)}
                </p>
                {!msg.senderName && msg.originalSenderName && (
                  <span className="text-xs text-neutral-500">
                    (was: {msg.originalSenderName})
                  </span>
                )}
                {msg.isDeleted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 uppercase tracking-wide">
                    <Trash2 className="h-2.5 w-2.5" aria-hidden />
                    Deleted
                  </span>
                )}
                <span className="text-xs text-neutral-400 ml-auto shrink-0">{formatDate(msg.createdAt)}</span>
              </div>

              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{msg.body}</p>

              {msg.isDeleted && (
                <div className="mt-2 pt-2 border-t border-red-200/60 text-xs text-neutral-500 space-y-0.5">
                  <p>
                    Type: <span className="font-medium text-neutral-700">{msg.deletionType === 'self_delete' ? 'self-delete' : 'admin-delete'}</span>
                  </p>
                  <p>Deleted at: {formatDate(msg.deletedAt)}</p>
                  {msg.deletedBy && <p>Deleted by: {msg.deletedBy}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
