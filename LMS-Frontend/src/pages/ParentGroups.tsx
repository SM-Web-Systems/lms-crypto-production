/**
 * ParentGroups — /parent/groups. A family group is the set of linked children a parent reward goes to.
 * The parent creates, renames, re-members and deletes groups here; Rewards needs at least one group.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Gift, Heart, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { parentService, type ParentChild, type ParentGroup } from '../services/parentService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import { getErrorMessage } from '../utils/apiError';

const NAME_MAX = 80;
const linkButtonClass =
  'touch-target inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium bg-accent-teal text-white hover:bg-accent-teal-hover focus:outline-none focus:ring-2 focus:ring-accent-teal focus:ring-offset-2';

type Editing = { id: string | null; name: string; memberIds: string[] };

const GroupForm: React.FC<{
  editing: Editing;
  linkedChildren: ParentChild[];
  onCancel: () => void;
  onSaved: () => void;
}> = ({ editing, linkedChildren, onCancel, onSaved }) => {
  const [name, setName] = useState(editing.name);
  // Only children still linked can be kept; anyone else would make the server refuse the save.
  const [memberIds, setMemberIds] = useState<string[]>(() =>
    editing.memberIds.filter((id) => linkedChildren.some((c) => c.id === id)));
  const [errors, setErrors] = useState<{ name?: string; members?: string; save?: string }>({});
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const firstChildRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const toggle = (id: string) =>
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const next = {
      name: !trimmed ? 'Enter a group name.' : trimmed.length > NAME_MAX ? `Use ${NAME_MAX} characters or fewer.` : undefined,
      // With no linked children left, a parent can still rename the group.
      members: memberIds.length === 0 && linkedChildren.length > 0 ? 'Choose at least one child.' : undefined,
    };
    setErrors(next);
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.members) { firstChildRef.current?.focus(); return; }
    setSaving(true);
    try {
      if (editing.id) await parentService.updateGroup(editing.id, { name: trimmed, memberIds });
      else await parentService.createGroup(trimmed, memberIds);
      onSaved();
    } catch (err) {
      setErrors({ save: getErrorMessage(err, 'Could not save the group. Please try again.') });
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={submit} noValidate className="space-y-4">
          <h2 className="text-base font-bold text-neutral-900">{editing.id ? 'Edit family group' : 'New family group'}</h2>
          <div>
            <label htmlFor="family-group-name" className="block text-sm font-medium text-neutral-700 mb-1">Group name</label>
            <input
              id="family-group-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example, The Smiths"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'family-group-name-error' : undefined}
              className={`touch-target w-full max-w-md px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-teal focus:border-transparent ${errors.name ? 'border-red-500' : 'border-neutral-300'}`}
            />
            {errors.name && <p id="family-group-name-error" role="alert" className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-neutral-700 mb-1">Children in this group</legend>
            {linkedChildren.length === 0 && (
              <p className="text-sm text-neutral-600">
                No children are linked to you. <Link to="/parent/children" className="font-medium text-accent-teal underline">Link a child</Link> to add them.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {linkedChildren.map((c, i) => (
                <label
                  key={c.id}
                  className="touch-target inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 cursor-pointer has-[:checked]:border-accent-teal has-[:checked]:bg-accent-teal/10"
                >
                  <input
                    type="checkbox"
                    ref={i === 0 ? firstChildRef : undefined}
                    checked={memberIds.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-invalid={!!errors.members}
                    aria-describedby={errors.members ? 'family-group-members-error' : undefined}
                    className="h-4 w-4 accent-accent-teal"
                  />
                  {c.name}
                </label>
              ))}
            </div>
            {errors.members && <p id="family-group-members-error" role="alert" className="mt-1 text-sm text-red-600">{errors.members}</p>}
          </fieldset>
          {errors.save && <p role="alert" className="text-sm text-red-700">{errors.save}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing.id ? 'Save changes' : 'Create group'}</Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const ParentGroups: React.FC = () => {
  const [groups, setGroups] = useState<ParentGroup[]>([]);
  const [linkedChildren, setLinkedChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<ParentGroup | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Only the latest load commits, so a slow earlier request cannot overwrite newer data.
  const reqIdRef = useRef(0);

  const load = useCallback(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setLoadError(null);
    Promise.all([parentService.getGroups(), parentService.getChildren()]).then(
      ([g, c]) => {
        if (reqIdRef.current !== myReqId) return;
        setGroups(g);
        setLinkedChildren(c);
        setLoading(false);
      },
      (err) => {
        if (reqIdRef.current !== myReqId) return;
        setLoadError(getErrorMessage(err, 'Could not load your family groups.'));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    const reqId = reqIdRef;
    load();
    return () => { ++reqId.current; };
  }, [load]);

  const startCreate = () => { setActionError(null); setEditing({ id: null, name: '', memberIds: [] }); };
  const startEdit = (g: ParentGroup) => {
    setActionError(null);
    setEditing({ id: g.id, name: g.name, memberIds: g.members.map((m) => m.id) });
  };
  const saved = () => { setEditing(null); load(); };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await parentService.deleteGroup(deleting.id);
      load();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Could not delete the group. Please try again.'));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = <div role="status" className="py-16 text-center text-neutral-500 text-sm">Loading...</div>;
  } else if (loadError) {
    body = (
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900" role="alert">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1">
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" size="sm" type="button" className="mt-2" onClick={load}>Try again</Button>
        </div>
      </div>
    );
  } else if (editing) {
    body = <GroupForm key={editing.id ?? 'new'} editing={editing} linkedChildren={linkedChildren} onCancel={() => setEditing(null)} onSaved={saved} />;
  } else if (groups.length === 0) {
    body = (
      <Card>
        <CardContent className="py-10 text-center">
          <Users className="mx-auto h-10 w-10 text-accent-teal" aria-hidden />
          <h2 className="mt-3 text-lg font-bold text-neutral-900">Create your family group</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
            Rewards go to the children in a family group. Name the group and choose which of your children are in it.
          </p>
          <div className="mt-5">
            {linkedChildren.length === 0 ? (
              <>
                <p className="mb-3 text-sm text-neutral-600">You need at least one linked child first.</p>
                <Link to="/parent/children" className={linkButtonClass}>
                  <Heart className="h-4 w-4" aria-hidden /> Link a child
                </Link>
              </>
            ) : (
              <Button type="button" onClick={startCreate}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden /> Create your family group
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-neutral-900">Your groups</h2>
          {linkedChildren.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden /> New group
            </Button>
          )}
        </div>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Card className="h-full">
                <CardContent className="py-4 space-y-3">
                  <h3 className="font-semibold text-neutral-900 break-words">{g.name}</h3>
                  {g.members.length === 0 ? (
                    <p className="text-sm text-neutral-500">No children in this group yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Children in ${g.name}`}>
                      {g.members.map((m) => (
                        <li key={m.id} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{m.name}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link to="/parent/rewards" className={linkButtonClass}>
                      <Gift className="h-4 w-4" aria-hidden /> Set up rewards
                    </Link>
                    <Button type="button" variant="outline" size="sm" onClick={() => startEdit(g)} aria-label={`Edit ${g.name}`}>
                      <Pencil className="h-4 w-4 mr-1.5" aria-hidden /> Edit
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setActionError(null); setDeleting(g); }} aria-label={`Delete ${g.name}`}>
                      <Trash2 className="h-4 w-4 mr-1.5" aria-hidden /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Family groups</h1>
        <p className="text-sm text-neutral-600 mt-1">Choose which of your children each reward goes to.</p>
      </div>
      {actionError && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{actionError}</p>
        </div>
      )}
      {body}
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.name ?? 'group'}?`}
        description="This removes the group. Your children stay linked to you. A group with funded or paid rewards can't be deleted."
        confirmLabel="Delete group"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};

export default ParentGroups;
