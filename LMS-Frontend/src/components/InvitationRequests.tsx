/**
 * InvitationRequests — parent, class and team requests waiting for the learner's answer.
 * If the learner arrived through an emailed sign-up link, the link is claimed first so its request shows here.
 */
import React, { useEffect, useState } from 'react';
import { ParentInvitationsPanel } from './ParentInvitationsPanel';
import { ClassInvitationsPanel } from './ClassInvitationsPanel';
import { MyConnectionsPanel } from './MyConnectionsPanel';
import { parentInvitationService } from '../services/parentInvitationService';
import { takeJoinToken } from '../utils/pendingJoin';
import { getErrorMessage } from '../utils/apiError';

export const InvitationRequests: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    const token = takeJoinToken();
    if (!token) { setReady(true); return; }
    parentInvitationService.claim(token)
      .catch((err) => { if (live) setNotice(getErrorMessage(err, 'That invitation link could not be used.')); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  if (!ready) return null;
  return (
    <>
      {notice ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{notice}</p> : null}
      <ParentInvitationsPanel />
      <ClassInvitationsPanel />
      <MyConnectionsPanel />
    </>
  );
};
