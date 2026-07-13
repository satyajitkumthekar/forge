/**
 * CookbookPanel - full-screen admin surface for a client's anchor cookbooks.
 * Upload-based authoring: the coach uploads the PDF they already make with
 * Claude; the server converts it once (never stored) and the preview below
 * is pixel-identical to what the client will see. Publish bakes each recipe
 * into is_anchor meal presets server-side.
 *
 * Two levels: list (all cookbooks for this client) and detail (preview +
 * actions). Upload always creates a new draft; Replace PDF re-converts into
 * the open cookbook, republishing automatically if it was live so the
 * client's presets never drift from the document.
 */

import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { db } from '@/lib/database';
import { toast } from '@/lib/toast';
import type { AnchorCookbook } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import CookbookView from '@/components/cookbook/CookbookView';

interface CookbookPanelProps {
  userId: string;
  email: string;
  fullName?: string | null;
  onClose: () => void;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

type ConfirmKind = 'publish' | 'unpublish' | 'delete';

export default function CookbookPanel({ userId, email, fullName, onClose }: CookbookPanelProps) {
  const displayName = fullName?.trim() || email;
  const [cookbooks, setCookbooks] = useState<AnchorCookbook[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; id: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  // Which cookbook the next upload replaces; null = create a new one
  const replaceTargetRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = cookbooks?.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    loadCookbooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadCookbooks = async () => {
    try {
      const list = await db.cookbooks.adminListForUser(userId);
      setCookbooks(list);
    } catch (err) {
      console.error('[Cookbooks] Error loading:', err);
      toast.error('Failed to load cookbooks');
      setCookbooks([]);
    }
  };

  const pickPdf = (replaceId: string | null) => {
    replaceTargetRef.current = replaceId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('PDF must be less than 10MB');
      return;
    }

    const replaceId = replaceTargetRef.current;
    replaceTargetRef.current = null;
    setConverting(true);

    try {
      const base64 = await fileToBase64(file);
      const { content } = await api.convertAnchorCookbook(base64);
      const saved = await db.cookbooks.adminSaveDraft(replaceId, userId, content);

      // A live cookbook must never drift from its presets — republish now
      const wasPublished = replaceId
        ? cookbooks?.find((c) => c.id === replaceId)?.status === 'published'
        : false;
      if (wasPublished) {
        await db.cookbooks.adminPublish(saved.id);
        toast.success('Cookbook updated and republished');
      } else {
        toast.success(`"${content.shortTitle}" ready. Review and publish`);
      }

      await loadCookbooks();
      setSelectedId(saved.id);
    } catch (err) {
      console.error('[Cookbooks] Conversion error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to convert the PDF');
    } finally {
      setConverting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    const { kind, id } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      if (kind === 'publish') {
        await db.cookbooks.adminPublish(id);
        toast.success(`Published. Live for ${displayName}`);
      } else if (kind === 'unpublish') {
        await db.cookbooks.adminUnpublish(id);
        toast.success('Unpublished. Back to draft');
      } else {
        await db.cookbooks.adminRemove(id);
        toast.success('Cookbook deleted');
        setSelectedId(null);
      }
      await loadCookbooks();
    } catch (err) {
      console.error('[Cookbooks] Action error:', err);
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!selected) return;
    const value = renameValue.trim();
    setRenaming(false);
    if (!value || value === selected.content.shortTitle) return;
    try {
      await db.cookbooks.adminRename(selected, value);
      await loadCookbooks();
    } catch (err) {
      console.error('[Cookbooks] Rename error:', err);
      toast.error('Failed to rename');
    }
  };

  const statusChip = (status: AnchorCookbook['status']) =>
    status === 'published' ? (
      <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full bg-accent-100 text-accent-700">
        Live
      </span>
    ) : (
      <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full bg-paper-inset text-ink-muted border border-line">
        Draft
      </span>
    );

  const backIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-paper overflow-y-auto">
      {/* Hidden PDF input — same native pattern as ChatInput's image picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Sticky frosted header */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-paper/85 backdrop-blur-md border-b border-line/70">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => (selected ? setSelectedId(null) : onClose())}
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center text-ink-soft hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label={selected ? 'Back to cookbooks' : 'Close'}
            >
              {backIcon}
            </button>
            <div className="min-w-0">
              {selected && renaming ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    autoFocus
                    className="!py-1.5 !text-sm"
                  />
                  <Button variant="secondary" size="sm" onClick={handleRename}>
                    Save
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-sm font-semibold tracking-tight text-ink truncate">
                      {selected ? selected.content.shortTitle : 'Cookbooks'}
                    </h1>
                    {selected && statusChip(selected.status)}
                    {selected && (
                      <button
                        onClick={() => {
                          setRenameValue(selected.content.shortTitle);
                          setRenaming(true);
                        }}
                        className="p-1.5 text-ink-faint hover:text-ink-muted rounded transition-colors"
                        aria-label="Rename"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted truncate">{fullName ? `${fullName} · ${email}` : email}</p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selected ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || converting}
                  onClick={() => pickPdf(selected.id)}
                >
                  Replace PDF
                </Button>
                {selected.status === 'published' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'unpublish', id: selected.id })}
                  >
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || converting}
                    onClick={() => setConfirm({ kind: 'publish', id: selected.id })}
                  >
                    Publish
                  </Button>
                )}
                <button
                  onClick={() => setConfirm({ kind: 'delete', id: selected.id })}
                  disabled={busy}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-ink-faint hover:text-danger rounded-ctrl transition-colors"
                  aria-label="Delete cookbook"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            ) : (
              <Button variant="primary" size="sm" disabled={converting} onClick={() => pickPdf(null)}>
                Upload PDF
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Converting: skeleton document while Claude reads the PDF */}
      {converting ? (
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-8">
            <svg className="animate-spin h-4 w-4 text-ink" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-ink">Claude is reading the cookbook… about a minute</span>
          </div>
          <Skeleton className="h-3 w-28 mb-4" />
          <Skeleton className="h-8 w-4/5 mb-2" />
          <Skeleton className="h-3 w-40 mb-10" />
          <Skeleton className="h-3.5 w-full mb-2" />
          <Skeleton className="h-3.5 w-full mb-2" />
          <Skeleton className="h-3.5 w-2/3 mb-10" />
          <Skeleton className="h-5 w-56 mb-3" />
          <Skeleton className="h-3.5 w-full mb-2" />
          <Skeleton className="h-3.5 w-5/6 mb-2" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ) : selected ? (
        /* Detail: the exact document the client will see */
        <CookbookView cookbook={selected} mode="preview" />
      ) : (
        /* List level */
        <div className="max-w-2xl mx-auto px-4 py-6">
          {cookbooks === null ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-card" />
              <Skeleton className="h-20 w-full rounded-card" />
            </div>
          ) : cookbooks.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm font-medium text-ink">No cookbooks yet</p>
              <p className="text-xs text-ink-muted mt-1 max-w-xs mx-auto">
                Upload the PDF you made with Claude — it becomes an in-app document with
                one-tap meal logging for {displayName}.
              </p>
              <Button variant="primary" size="sm" className="mt-5" onClick={() => pickPdf(null)}>
                Upload PDF
              </Button>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {cookbooks.map((cb) => (
                <button
                  key={cb.id}
                  onClick={() => setSelectedId(cb.id)}
                  className="w-full text-left bg-paper-raised rounded-card border border-line p-4 shadow-card hover:bg-paper-inset active:bg-paper-deep transition duration-150"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink break-words">
                        {cb.content.shortTitle}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {cb.content.meals.length} meal{cb.content.meals.length === 1 ? '' : 's'} ·
                        Updated {format(new Date(cb.updated_at), 'MMM d')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusChip(cb.status)}
                      <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'publish'}
        title={`Send to ${displayName}?`}
        message="They'll get a personal reveal on next open, and every recipe becomes a one-tap preset in their app."
        confirmLabel="Publish"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'unpublish'}
        title={`Remove from ${displayName}'s app?`}
        message="The cookbook returns to draft and its presets are removed. Their logged history is untouched."
        confirmLabel="Unpublish"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete this cookbook?"
        message="This can't be undone. Their logged history is untouched."
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
