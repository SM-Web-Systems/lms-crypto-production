/**
 * ParentInvitationsPanel — a learner sees parents who asked to link to their account and chooses yes or no.
 * Renders nothing when there is nothing to answer.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { parentInvitationService, type MyParentInvitation } from '../services/parentInvitationService';
import { getErrorMessage } from '../utils/apiError';

/** onAnswered: called after the learner answers, so a list of their links can refresh. */
export const ParentInvitationsPanel: React.FC<{ onAnswered?: () => void }> = ({ onAnswered }) => {
  const [items, setItems] = useState<MyParentInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems(await parentInvitationService.mine()); } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const answer = async (id: string, accept: boolean) => {
    setBusyId(id); setError('');
    try { await parentInvitationService.respond(id, accept); await load(); onAnswered?.(); }
    catch (err) { setError(getErrorMessage(err, 'Could not answer the request.')); }
    finally { setBusyId(null); }
  };

  if (items.length === 0 && !error) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <CardTitle className="mb-3 text-base">Parent requests</CardTitle>
        {error ? <p role="alert" className="mb-2 text-sm text-red-700">{error}</p> : null}
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-neutral-800"><strong>{i.parentName}</strong> asked to link to your account as your parent. Accepting lets them see your progress, sign-ins and wallet.</p>
              <span className="flex gap-2">
                <Button size="sm" disabled={busyId === i.id} onClick={() => answer(i.id, true)}>Accept</Button>
                <Button size="sm" variant="outline" disabled={busyId === i.id} onClick={() => answer(i.id, false)}>Decline</Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
