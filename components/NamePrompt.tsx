/**
 * NamePrompt - required one-time full-name capture for existing users.
 * No close button, no scrim dismiss: saving is the only way forward.
 * Fires first in the Track popup chain, once ever per account.
 */

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface NamePromptProps {
  open: boolean;
  /** Persists the name; throwing keeps the prompt open with the error shown */
  onSave: (name: string) => Promise<void>;
}

export default function NamePrompt({ open, onSave }: NamePromptProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 80;

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || saving) return;

    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
    } catch (err) {
      console.error('Error saving name:', err);
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      {/* No onClick: this prompt cannot be dismissed */}
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative bg-paper-raised rounded-card shadow-overlay p-6 w-full max-w-sm animate-toast-in">
        <h2 className="text-lg font-semibold tracking-tight text-ink mb-1.5">
          What&apos;s your full name?
        </h2>
        <p className="text-sm text-ink-soft leading-relaxed mb-5">Takes 5 seconds.</p>

        <form onSubmit={handleSave} className="space-y-3" noValidate>
          <Input
            id="prompt-full-name"
            type="text"
            placeholder="Your full name"
            autoComplete="name"
            autoCapitalize="words"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            error={error || undefined}
          />
          <Button type="submit" fullWidth disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </div>
    </div>
  );
}
