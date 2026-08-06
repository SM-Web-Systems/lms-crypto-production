import React, { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { notificationService } from '../services/notificationService';
import { Card, CardContent, CardTitle } from './Card';

const TARGET_OPTIONS = [
  { value: 'all', label: 'All Users' },
  { value: 'student', label: 'Students' },
  { value: 'lecturer', label: 'Lecturers' },
  { value: 'sponsor', label: 'Sponsors' },
] as const;

export const BroadcastPanel: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const data = await notificationService.broadcast(title.trim(), body.trim(), target);
      setResult(`Broadcast sent to ${data.sent} user${data.sent !== 1 ? 's' : ''}`);
      setTitle('');
      setBody('');
      setTarget('all');
    } catch {
      setError('Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-amber-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <CardTitle className="border-0 p-0 text-neutral-900">Broadcast Notification</CardTitle>
        </div>
      </div>
      <CardContent className="px-5 py-4">
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label htmlFor="broadcast-title" className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
            <input
              id="broadcast-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="broadcast-body" className="block text-sm font-medium text-neutral-700 mb-1">Message</label>
            <textarea
              id="broadcast-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification message"
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              required
            />
          </div>
          <div>
            <label htmlFor="broadcast-target" className="block text-sm font-medium text-neutral-700 mb-1">Target Audience</label>
            <select
              id="broadcast-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              {TARGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {result && <p className="text-sm text-green-600" role="status">{result}</p>}

          <button
            type="submit"
            disabled={sending || !title.trim() || !body.trim()}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
};
