/**
 * MacroTable Component - Food Entries List
 * Displays logged food entries with delete and duplicate actions.
 * Optional selection mode lets the user save entries as a reusable meal.
 */

import React, { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import NameMealDialog from '@/components/meals/NameMealDialog';
import type { FoodItemInput } from '@/lib/database';
import type { FoodEntry } from '@/types';

interface MacroTableProps {
  entries: FoodEntry[];
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  /** When provided (with ≥2 entries), enables "Select → Save as meal" */
  onSaveAsMeal?: (name: string, items: FoodItemInput[]) => void;
}

export default function MacroTable({ entries, onDeleteEntry, onDuplicateEntry, onSaveAsMeal }: MacroTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameDialogOpen, setNameDialogOpen] = useState(false);

  const handleDuplicate = (entryId: string) => {
    onDuplicateEntry(entryId);
  };

  const canSelect = onSaveAsMeal !== undefined && entries.length >= 2;

  const startSelecting = () => {
    setSelectedIds(new Set());
    setSelecting(true);
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (entryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const handleNameSave = (name: string) => {
    const items: FoodItemInput[] = entries
      .filter((entry) => selectedIds.has(entry.id))
      .map(({ name: entryName, calories, protein, description }) => ({
        name: entryName,
        calories,
        protein,
        description,
      }));

    setNameDialogOpen(false);
    exitSelecting();
    onSaveAsMeal?.(name, items);
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
          {/* Slim header row: entry point to selection mode */}
          {canSelect && !selecting && (
            <div className="flex items-center justify-end px-2 py-1 border-b border-line/60">
              <button
                onClick={startSelecting}
                className="min-h-[36px] px-3 text-xs font-medium text-ink-muted hover:text-ink hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              >
                Select
              </button>
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-paper-inset/70">
                <th className="text-left py-2.5 px-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Food</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Cal</th>
                <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Pro</th>
                <th className={selecting ? 'w-14' : 'w-20'}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isSelected = selectedIds.has(entry.id);
                return (
                  <tr
                    key={entry.id}
                    onClick={selecting ? () => toggleSelected(entry.id) : undefined}
                    className={`border-b border-line/60 last:border-b-0 hover:bg-paper-inset/50 transition-colors animate-entry-in ${
                      selecting ? 'cursor-pointer' : ''
                    } ${isSelected ? 'bg-paper-inset/50' : ''}`}
                  >
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
                      {selecting ? (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelected(entry.id);
                            }}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-ctrl transition duration-150"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={isSelected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full border flex items-center justify-center transition duration-150 ${
                                isSelected ? 'bg-ink border-ink' : 'bg-paper-raised border-line-strong'
                              }`}
                            >
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                          </button>
                        </div>
                      ) : (
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
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Selection footer */}
          {selecting && (
            <div className="border-t border-line p-3 flex items-center gap-2 animate-toast-in">
              <Button size="sm" disabled={selectedIds.size === 0} onClick={() => setNameDialogOpen(true)}>
                Save as meal ({selectedIds.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={exitSelecting}>
                Cancel
              </Button>
            </div>
          )}
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

      <NameMealDialog
        open={nameDialogOpen}
        onSave={handleNameSave}
        onCancel={() => setNameDialogOpen(false)}
      />
    </div>
  );
}
