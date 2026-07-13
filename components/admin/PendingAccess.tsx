/**
 * PendingAccess - the doorman's inbox: signups awaiting an access grant.
 * Renders nothing when the list is empty. Stateless: grant/delete handlers
 * and the busy flag live in the parent.
 */

import React from 'react';
import type { UserMetric } from '@/types';
import Button from '@/components/ui/Button';

interface PendingAccessProps {
  users: UserMetric[];
  /** user_id currently being granted/deleted, for button busy states */
  busyUserId: string | null;
  onGrant: (userId: string) => void;
  onDelete: (user: UserMetric) => void;
}

const signupDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'unknown date';

export default function PendingAccess({ users, busyUserId, onGrant, onDelete }: PendingAccessProps) {
  const hasPending = users.length > 0;

  return (
    <div
      className={`bg-paper-raised rounded-card border shadow-card overflow-hidden ${
        hasPending ? 'border-warn/40' : 'border-line'
      }`}
    >
      <div className={`px-6 py-4 flex items-center gap-2 ${hasPending ? 'border-b border-line' : ''}`}>
        <span
          className={`w-2 h-2 rounded-full ${hasPending ? 'bg-warn' : 'bg-accent-500'}`}
          aria-hidden="true"
        />
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Pending access{hasPending ? ` (${users.length})` : ''}
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {hasPending
              ? 'New signups waiting for you to let them in.'
              : 'No one waiting. New signups appear here for your approval.'}
          </p>
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {users.map((user) => (
          <div key={user.user_id} className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink truncate">
                {user.full_name ?? <span className="italic text-ink-muted">No name yet</span>}
              </div>
              <div className="text-xs text-ink-muted truncate">
                {user.email} · signed up {signupDate(user.signed_up_at)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                disabled={busyUserId === user.user_id}
                onClick={() => onGrant(user.user_id)}
              >
                {busyUserId === user.user_id ? '...' : 'Grant access'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="!text-danger"
                disabled={busyUserId === user.user_id}
                onClick={() => onDelete(user)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
