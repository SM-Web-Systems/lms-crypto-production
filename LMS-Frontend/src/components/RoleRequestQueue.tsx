/** RoleRequestQueue — administrators who can assign roles approve or decline role requests. Hidden for everyone else. */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { roleRequestService, type RoleRequest } from '../services/roleRequestService';
import { getErrorMessage } from '../utils/apiError';

export const RoleRequestQueue: React.FC = () => {
  const [items, setItems] = useState<RoleRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await roleRequestService.queue()); } catch { setItems(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id); setError('');
    try { await roleRequestService.decide(id, approve, notes[id] ?? ''); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not save the decision.')); }
    finally { setBusyId(null); }
  };

  if (items === null) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <CardTitle className="mb-3 text-base">Role requests {items.length ? `(${items.length})` : ''}</CardTitle>
        {error ? <p role="alert" className="mb-2 text-sm text-red-700">{error}</p> : null}
        {items.length === 0 ? <p className="text-sm text-neutral-500">No requests waiting.</p> : (
          <ul className="space-y-4">
            {items.map((r) => (
              <li key={r.id} className="space-y-2 border-b border-neutral-100 pb-3 last:border-0">
                <p className="text-sm text-neutral-800"><strong>{r.userName}</strong> <span className="break-all text-neutral-500">({r.userEmail})</span> asks to be a <strong>{r.roleLabel}</strong>.</p>
                <p className="text-sm text-neutral-600">“{r.reason}”</p>
                <input aria-label={`Note to ${r.userName}`} value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  placeholder="Note to the user (optional)" className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
                <span className="flex gap-2">
                  <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r.id, true)}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id, false)}>Decline</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
