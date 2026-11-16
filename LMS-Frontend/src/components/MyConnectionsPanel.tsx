/**
 * MyConnectionsPanel — the learner sees who is linked to them (parents, classes, teams) and can leave any of them.
 * Renders nothing when there are no links.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { ConfirmButton } from './ConfirmButton';
import { connectionService, type MyConnections } from '../services/connectionService';
import { getErrorMessage } from '../utils/apiError';

export const MyConnectionsPanel: React.FC = () => {
  const [data, setData] = useState<MyConnections>({ parents: [], groups: [] });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await connectionService.mine()); } catch { setData({ parents: [], groups: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); await load(); } catch (err) { setError(getErrorMessage(err, 'Could not leave.')); }
  };

  if (data.parents.length === 0 && data.groups.length === 0 && !error) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <CardTitle className="mb-1 text-base">Who can see your progress</CardTitle>
        <p className="mb-3 text-sm text-neutral-600">You can leave any of these at any time.</p>
        {error ? <p role="alert" className="mb-2 text-sm text-red-700">{error}</p> : null}
        <ul className="space-y-2">
          {data.parents.map((p) => (
            <li key={`p-${p.id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-800">
              <span><strong>{p.name}</strong> · parent (sees progress, sign-ins and wallet)</span>
              <ConfirmButton label="Remove" confirmLabel={`Remove ${p.name}`} onConfirm={() => run(() => connectionService.leaveParent(p.id))} />
            </li>
          ))}
          {data.groups.map((g) => (
            <li key={`g-${g.id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-800">
              <span><strong>{g.name}</strong> · {g.groupType} run by {g.ownerName}</span>
              <ConfirmButton label="Leave" confirmLabel={`Leave ${g.groupType}`} onConfirm={() => run(() => connectionService.leaveGroup(g.id))} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
