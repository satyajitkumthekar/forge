/**
 * UserChips - collapsible user-selection chip list for Coach Analytics.
 * Stateless: open state, selection set, and all handlers live in the parent.
 */

import React from 'react';
import type { CoachAnalyticsRow } from '@/types';
import Button from '@/components/ui/Button';

interface UserChipsProps {
  users: CoachAnalyticsRow[];
  selectedUsers: Set<string>;
  /** Clients with 2+ unlogged elapsed days this week — shown in red */
  flaggedUsers?: Set<string>;
  open: boolean;
  onToggleOpen: () => void;
  onToggleUser: (userId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export default function UserChips({
  users,
  selectedUsers,
  flaggedUsers,
  open,
  onToggleOpen,
  onToggleUser,
  onSelectAll,
  onClear,
}: UserChipsProps) {
  return (
    <div>
      <button
        onClick={onToggleOpen}
        className="w-full bg-paper-inset rounded-ctrl border border-line p-3 hover:bg-paper-inset active:bg-paper-deep transition-all flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink">User Selection</span>
          <span className="text-xs text-ink-muted">
            ({selectedUsers.size} of {users.length} selected)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!open && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAll();
                }}
              >
                Select All
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              >
                Clear
              </Button>
            </>
          )}
          <svg
            className={`w-4 h-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onSelectAll}>
              Select All
            </Button>
            <Button variant="secondary" size="sm" onClick={onClear}>
              Deselect All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {users.map(user => {
              const isSelected = selectedUsers.has(user.user_id);
              const isFlagged = flaggedUsers?.has(user.user_id) ?? false;
              return (
                <button
                  key={user.user_id}
                  onClick={() => onToggleUser(user.user_id)}
                  title={isFlagged ? 'No logs on 2+ days this week' : undefined}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium max-w-[200px] truncate transition duration-150 ${
                    isFlagged
                      ? isSelected
                        ? 'bg-danger text-white'
                        : 'bg-danger-soft text-danger border border-danger/30 hover:brightness-95'
                      : isSelected
                        ? 'bg-ink text-white'
                        : 'bg-paper-inset text-ink-soft border border-line hover:bg-paper-deep'
                  }`}
                >
                  {user.email}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
