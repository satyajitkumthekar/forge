/**
 * MacroTable Component - Food Entries List
 * Displays logged food entries with delete and duplicate actions
 */

import React, { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import type { FoodEntry } from '@/types';

interface MacroTableProps {
  entries: FoodEntry[];
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
}

export default function MacroTable({ entries, onDeleteEntry, onDuplicateEntry }: MacroTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDuplicate = (entryId: string) => {
    onDuplicateEntry(entryId);
  };

  return (
    <div>
      {entries.length === 0 ? (
        <Card translucent>
          <EmptyState
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="No entries yet"
            subtitle="Start logging your meals below"
          />
        </Card>
      ) : (
        <Card translucent className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-paper-inset/70">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Food</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Cal</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Pro</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line/60 last:border-b-0 hover:bg-paper-inset/50 transition-colors animate-fade-in">
                  <td className="py-3 px-3">
                    <div className="font-medium text-ink text-sm">{entry.name}</div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="text-xs font-semibold text-ink tabular-nums">{entry.calories}</div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="text-xs font-semibold text-ink tabular-nums">{entry.protein}g</div>
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleDuplicate(entry.id)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
                        title="Duplicate"
                        aria-label="Duplicate entry"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-danger hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
                        title="Delete"
                        aria-label="Delete entry"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this entry?"
        message="This will remove it from your log."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) onDeleteEntry(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
