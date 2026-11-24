/**
 * WebSearchSwitch - the one switch for the food analyser's web search, for
 * everyone. On: brands, packaged foods and chain dishes are looked up
 * online and their label is used. Off: every food is estimated. The
 * analyser reads it on every log, so a change applies straight away.
 *
 * Admins only: the Admin page shows it to admins, and the database lets
 * only admins change it (system_settings' update rule).
 */

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/database';
import { toast } from '@/lib/toast';

export default function WebSearchSwitch() {
  // null until loaded
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    db.admin
      .getFoodWebSearch()
      .then((on) => {
        if (!cancelled) setEnabled(on);
      })
      .catch((err) => {
        console.error('[WebSearchSwitch] Could not load:', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    setSaving(true);
    try {
      const now = await db.admin.setFoodWebSearch(!enabled);
      setEnabled(now);
      toast.success(now ? 'Web search is on for everyone.' : 'Web search is off for everyone. Every food will be estimated.');
    } catch (err) {
      console.error('[WebSearchSwitch] Could not update:', err);
      toast.error('Could not update. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || enabled === null;

  return (
    <div className="bg-paper-raised rounded-card border border-line shadow-card px-6 py-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Web search for food</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          {failed
            ? 'Could not load this setting. Reload the page to try again.'
            : 'Looks up brands, packaged foods and chain dishes online and uses their label. Off means every food is estimated. Applies to everyone straight away.'}
        </p>
      </div>

      {!failed && (
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-label="Web search for food"
          onClick={toggle}
          disabled={busy}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            enabled
              ? 'bg-accent-100 text-accent-700 border border-accent-100 hover:bg-accent-100'
              : 'bg-paper-inset text-ink-muted border border-line hover:bg-paper-deep'
          } ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        >
          {busy ? '...' : enabled ? 'ON' : 'OFF'}
        </button>
      )}
    </div>
  );
}
