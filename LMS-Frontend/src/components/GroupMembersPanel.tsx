/** GroupMembersPanel — a teacher's class or an employer's team: who is in it, with Remove for one learner. */
import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
import { connectionService, type GroupMember } from '../services/connectionService';
import { getErrorMessage } from '../utils/apiError';

export const GroupMembersPanel: React.FC<{ kind: 'class' | 'team'; groupId: string }> = ({ kind, groupId }) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setMembers(await connectionService.members(kind, groupId)); } catch { setMembers([]); }
  }, [kind, groupId]);
  useEffect(() => { load(); }, [load]);

  const remove = async (userId: string) => {
    setError('');
    try { await connectionService.removeMember(kind, groupId, userId); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not remove the learner.')); }
  };

  if (members.length === 0 && !error) return null;
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      {error ? <p role="alert" className="mb-2 text-xs text-red-700">{error}</p> : null}
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-700">
            <span className="break-all">{m.name} · {m.email}</span>
            <ConfirmButton label="Remove" confirmLabel={`Remove from ${kind}`} onConfirm={() => remove(m.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
};
