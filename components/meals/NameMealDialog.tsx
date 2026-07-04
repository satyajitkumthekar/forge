/**
 * NameMealDialog - ConfirmDialog-style overlay with a name input.
 * Used when saving selected entries from Track as a reusable meal.
 * Controlled component: the parent owns the `open` state.
 */

import React, { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface NameMealDialogProps {
  open: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export default function NameMealDialog({ open, onSave, onCancel }: NameMealDialogProps) {
  const [name, setName] = useState('');

  // Fresh field every time the dialog opens
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div className="relative bg-paper-raised rounded-card shadow-overlay p-5 w-full max-w-sm">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Name this meal</h2>
        <form onSubmit={handleSubmit}>
          <div className="mt-3">
            <Input
              id="name-meal-dialog-input"
              label="Meal name"
              placeholder='e.g. "Chicken curry lunch"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2 mt-5">
            <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
