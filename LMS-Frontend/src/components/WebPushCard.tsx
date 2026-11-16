import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Share, PlusSquare } from 'lucide-react';
import { disableWebPush, enableWebPush, getWebPushStatus, sendTestPush, type WebPushStatus } from '../lib/webPush';

const MESSAGES: Record<WebPushStatus, string> = {
  unsupported: 'This browser does not support push notifications.',
  'needs-home-screen': 'On iPhone or iPad, push notifications only work in the LMS app on your Home Screen.',
  'server-off': 'Push notifications are not switched on for this LMS server yet.',
  denied: 'Notifications are blocked for this app. Allow them in Settings > Notifications > SMWS LMS, then come back.',
  available: 'Get LMS notifications on this device, even when the app is closed.',
  enabled: 'Push notifications are on for this device.',
};

/** Home-screen web app push (iPhone iOS 16.4+, Android, desktop). */
const WebPushCard: React.FC = () => {
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const refresh = useCallback(() => { getWebPushStatus().then(setStatus).catch(() => setStatus('unsupported')); }, []);
  useEffect(refresh, [refresh]);

  const run = async (work: () => Promise<WebPushStatus | void>, done?: string) => {
    setBusy(true); setNote('');
    try { const next = await work(); if (next) setStatus(next); if (done) setNote(done); }
    catch { setNote('Something went wrong. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  if (!status) return null;
  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm ring-1 ring-neutral-900/5 p-5" data-testid="web-push-card">
      <div className="flex items-center gap-2 mb-2">
        <BellRing className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="text-base font-semibold text-neutral-800">Push notifications on this device</h2>
      </div>
      <p className="text-sm text-neutral-600" data-testid="web-push-status">{MESSAGES[status]}</p>
      {status === 'needs-home-screen' && (
        <ol className="mt-3 space-y-1.5 text-sm text-neutral-700 list-decimal list-inside">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong>, then <PlusSquare className="inline h-4 w-4 align-text-bottom" aria-hidden="true" /> <strong>Add to Home Screen</strong>.</li>
          <li>Open <strong>SMWS LMS</strong> from your Home Screen, sign in, and come back to this page.</li>
        </ol>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'available' && (
          <button type="button" disabled={busy} onClick={() => run(enableWebPush)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Enabling...' : 'Enable notifications'}
          </button>
        )}
        {status === 'enabled' && (<>
          <button type="button" disabled={busy}
            onClick={() => run(sendTestPush, 'Test sent. It should arrive within a few seconds. Lock your phone to see it on the lock screen.')}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Send a test notification
          </button>
          <button type="button" disabled={busy} onClick={() => run(disableWebPush)}
            className="px-4 py-2 text-sm font-medium rounded-lg ring-1 ring-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Turn off on this device
          </button>
        </>)}
      </div>
      {note && <p className="mt-3 text-sm text-neutral-600" role="status">{note}</p>}
    </div>
  );
};
export default WebPushCard;
