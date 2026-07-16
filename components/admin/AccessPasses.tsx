/**
 * AccessPasses - entry codes with limited uses, managed by the admin.
 * Anyone on the holding screen who enters an active code with uses left
 * gets access instantly. Stateless except the create-row inputs; all
 * mutations go through the parent's handlers.
 */

import React, { useState } from 'react';
import type { AccessPass } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface AccessPassesProps {
  passes: AccessPass[];
  /** Pass id currently being toggled/deleted */
  busyId: string | null;
  creating: boolean;
  /** Resolves true on success so the create row can clear itself */
  onCreate: (code: string, maxUses: number) => Promise<boolean>;
  onToggleActive: (pass: AccessPass) => void;
  onDelete: (pass: AccessPass) => void;
}

// No ambiguous characters (0/O, 1/I) — these codes get read out loud
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)]).join('');

export default function AccessPasses({
  passes,
  busyId,
  creating,
  onCreate,
  onToggleActive,
  onDelete,
}: AccessPassesProps) {
  const [newCode, setNewCode] = useState('');
  const [newUses, setNewUses] = useState('1');

  const usesNumber = parseInt(newUses, 10);
  const canCreate =
    !creating && /^[A-Za-z0-9-]{4,24}$/.test(newCode.trim()) && usesNumber >= 1 && usesNumber <= 1000;

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canCreate) return;
    const ok = await onCreate(newCode.trim(), usesNumber);
    if (ok) {
      setNewCode('');
      setNewUses('1');
    }
  };

  return (
    <div className="bg-paper-raised rounded-card border border-line shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line">
        <h2 className="text-sm font-semibold tracking-tight text-ink">Access passes</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Codes that let people in from the holding screen. Each use spends one.
        </p>
      </div>

      {/* Create row */}
      <form onSubmit={handleCreate} className="px-6 py-4 border-b border-line flex items-start gap-2 flex-wrap" noValidate>
        <div className="flex-1 min-w-[160px]">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="Code, e.g. SUMMER10"
            autoCapitalize="characters"
            autoComplete="off"
            disabled={creating}
            hint="4 to 24 letters, numbers and dashes"
          />
        </div>
        <div className="w-24">
          <Input
            type="number"
            value={newUses}
            onChange={(e) => setNewUses(e.target.value)}
            min={1}
            max={1000}
            disabled={creating}
            unit="uses"
          />
        </div>
        <Button type="button" variant="secondary" disabled={creating} onClick={() => setNewCode(randomCode())}>
          Generate
        </Button>
        <Button type="submit" disabled={!canCreate}>
          {creating ? '...' : 'Create'}
        </Button>
      </form>

      {/* Pass list */}
      {passes.length === 0 ? (
        <div className="px-6 py-5">
          <p className="text-xs text-ink-muted">
            No passes yet. Create one to let someone in without waiting for a grant.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line/60">
          {passes.map((pass) => {
            const spent = pass.uses_remaining === 0;
            return (
              <div key={pass.id} className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink tabular-nums tracking-wider">
                    {pass.code}
                  </span>
                  <span className={`text-xs tabular-nums ${spent ? 'text-ink-faint' : 'text-ink-muted'}`}>
                    {pass.uses_remaining} of {pass.max_uses} left
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onToggleActive(pass)}
                    disabled={busyId === pass.id}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      pass.active
                        ? 'bg-accent-100 text-accent-700 border border-accent-100 hover:bg-accent-100'
                        : 'bg-paper-inset text-ink-muted border border-line hover:bg-paper-deep'
                    } ${busyId === pass.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                  >
                    {busyId === pass.id ? '...' : pass.active ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => onDelete(pass)}
                    disabled={busyId === pass.id}
                    className="p-1.5 text-ink-faint hover:text-danger rounded-ctrl transition-colors"
                    aria-label={`Delete pass ${pass.code}`}
                    title="Delete pass"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
