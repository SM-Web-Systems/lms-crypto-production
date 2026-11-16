/**
 * RoleRequestPanel — on the user's own profile: ask for a parent, teacher, employer or sponsor role
 * (and teaching assistant, for super students). An administrator approves or declines.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { roleRequestService, type RequestableRole, type RoleRequest } from '../services/roleRequestService';
import { getErrorMessage } from '../utils/apiError';

const STATUS: Record<RoleRequest['status'], string> = { pending: 'waiting for an administrator', approved: 'approved', declined: 'declined', cancelled: 'withdrawn' };

export const RoleRequestPanel: React.FC = () => {
  const [roles, setRoles] = useState<RequestableRole[]>([]);
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [roleId, setRoleId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try { const d = await roleRequestService.mine(); setRoles(d.roles); setRequests(d.requests); } catch { setRoles([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try { await roleRequestService.create(roleId, reason.trim()); setReason(''); setRoleId(''); setNotice('Request sent. You will get an email when an administrator answers.'); await load(); }
    catch (err) { setError(getErrorMessage(err, 'Could not send the request.')); }
    finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    try { await roleRequestService.cancel(id); await load(); } catch (err) { setError(getErrorMessage(err, 'Could not withdraw the request.')); }
  };

  if (roles.length === 0 && requests.length === 0) return null;
  return (
    <Card className="mb-8">
      <CardContent className="p-5">
        <CardTitle className="mb-1 text-base">Request another role</CardTitle>
        <p className="mb-3 text-sm text-neutral-600">Parents, teachers, employers and sponsors can link learners and set up rewards. An administrator checks every request.</p>
        <form onSubmit={submit} className="space-y-2">
          <select aria-label="Role" required value={roleId} onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm sm:w-auto">
            <option value="">Choose a role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <textarea aria-label="Why do you need this role?" required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you need this role? For example your school or company." rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
          <Button size="sm" type="submit" disabled={busy || !roleId || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send request'}</Button>
        </form>
        {notice ? <p role="status" className="mt-2 text-xs text-neutral-600">{notice}</p> : null}
        {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
        {requests.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-neutral-100 pt-3">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-700">
                <span>{r.roleLabel} · {STATUS[r.status]}{r.reviewNote ? ` · “${r.reviewNote}”` : ''}</span>
                {r.status === 'pending' ? <button type="button" className="text-primary-600 hover:underline" onClick={() => withdraw(r.id)}>Withdraw</button> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
};
