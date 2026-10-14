'use client';

import { useMemo, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingPreparationRecord,
  PreparationWorkflowAudience,
  PreparationWorkflowNote,
} from '@/lib/billing-shared/types';
import { fetchPanelUsers, type PanelUserListItem } from '@/lib/api';

const AUDIENCE_OPTIONS: Array<{
  value: PreparationWorkflowAudience;
  label: string;
}> = [
  { value: 'preparation', label: 'Preparation maker' },
  { value: 'draft_invoicing', label: 'Draft invoicing maker' },
  { value: 'all', label: 'Everyone on this flight' },
];

function audienceLabel(audience: PreparationWorkflowAudience): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? audience;
}

function formatNoteTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type Props = {
  record: BillingPreparationRecord;
  api: BillingApi;
  onUpdated?: (record: BillingPreparationRecord) => void;
  /** When posting from draft page, route through draft endpoint for grouped drafts. */
  draftId?: string;
  readOnly?: boolean;
};

export function PreparationWorkflowRemarks({
  record,
  api,
  onUpdated,
  draftId,
  readOnly = false,
}: Props) {
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<PreparationWorkflowAudience>('all');
  const [directedTo, setDirectedTo] = useState('');
  const [users, setUsers] = useState<PanelUserListItem[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const notes = useMemo(
    () =>
      [...(record.workflowNotes ?? [])].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      ),
    [record.workflowNotes],
  );

  const loadUsers = async () => {
    if (usersLoaded) return;
    try {
      const list = await fetchPanelUsers();
      setUsers(list);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoaded(true);
    }
  };

  const selectedUser = users.find(
    (u) => String(u.userid ?? u.id) === directedTo,
  );

  const submit = async () => {
    const text = body.trim();
    if (!text || saving || readOnly) return;

    setSaving(true);
    setError('');
    try {
      const payload = {
        body: text,
        audience,
        directedToUserId: directedTo || undefined,
        directedToUserName: selectedUser
          ? String(selectedUser.name ?? selectedUser.userid ?? '').trim() || undefined
          : undefined,
      };

      let updated: BillingPreparationRecord | undefined;
      if (draftId) {
        const res = await api.addDraftPreparationRemark(draftId, {
          ...payload,
          preparationRecordId: String(record._id),
        });
        const records = (res as { data?: { preparationRecords?: BillingPreparationRecord[] } })
          .data?.preparationRecords;
        updated = records?.find((r) => String(r._id) === String(record._id));
      } else {
        const res = await api.addPreparationRemark(String(record._id), payload);
        updated = (res as { data?: BillingPreparationRecord }).data;
      }

      if (updated) onUpdated?.(updated);
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send remark');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <MessageSquare className="h-4 w-4 text-gray-500" aria-hidden />
        <h4 className="text-sm font-semibold text-gray-900">Workflow remarks</h4>
        <span className="text-xs text-gray-500">({notes.length})</span>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto px-4 py-3">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No remarks yet — use this thread between preparation and draft invoicing.
          </p>
        ) : (
          notes.map((note) => (
            <RemarkItem key={note.id} note={note} />
          ))
        )}
      </div>

      {!readOnly ? (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Feedback, errors to fix, or handoff notes for the next checkpoint…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--billing-accent)]"
            disabled={saving}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor={`remark-audience-${record._id}`} className="sr-only">
                Notify
              </label>
              <select
                id={`remark-audience-${record._id}`}
                value={audience}
                onChange={(e) =>
                  setAudience(e.target.value as PreparationWorkflowAudience)
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                disabled={saving}
              >
                {AUDIENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Notify: {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor={`remark-user-${record._id}`} className="sr-only">
                Direct to user (optional)
              </label>
              <select
                id={`remark-user-${record._id}`}
                value={directedTo}
                onFocus={() => void loadUsers()}
                onChange={(e) => setDirectedTo(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                disabled={saving}
              >
                <option value="">Direct to user (optional)</option>
                {users.map((u) => {
                  const id = String(u.userid ?? u.id ?? '');
                  const label = String(u.name ?? u.userid ?? id);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!body.trim() || saving}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send remark
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RemarkItem({ note }: { note: PreparationWorkflowNote }) {
  const isSendBack = note.context?.startsWith('send_back:');
  return (
    <article
      className={`rounded-md border px-3 py-2.5 text-sm ${
        isSendBack ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100 bg-gray-50/50'
      }`}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-gray-500">
        <span className="font-medium text-gray-800">{note.userName}</span>
        <span>{formatNoteTime(note.at)}</span>
        <span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-gray-200">
          {audienceLabel(note.audience)}
        </span>
        {note.directedToUserName ? (
          <span>→ {note.directedToUserName}</span>
        ) : null}
      </header>
      <p className="mt-1.5 whitespace-pre-wrap text-gray-800">{note.body}</p>
    </article>
  );
}
