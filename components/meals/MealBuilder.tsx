/**
 * MealBuilder - full-screen takeover for creating/editing a saved meal.
 * Mirrors the Track logging experience: analyze bar (ChatInput clone) appends
 * items to a local draft instead of logging them.
 * ABSTRACTION: Uses api.analyzeFood(), db.rateLimit and db.meals only.
 */

import React, { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { db, type FoodItemInput } from '@/lib/database';
import { toast } from '@/lib/toast';
import { useCountUp } from '@/utils/use-count-up';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Meal } from '@/types';

interface MealBuilderProps {
  /** When set, the builder edits this meal; otherwise it creates a new one */
  meal?: Meal;
  onSaved: (meal: Meal) => void;
  onCancel: () => void;
}

/** Draft items carry a local uid so removals keep stable React keys */
type DraftItem = FoodItemInput & { uid: string };

const makeUid = () => `draft_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

// Convert file to base64 (same helper as ChatInput)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function MealBuilder({ meal, onSaved, onCancel }: MealBuilderProps) {
  const [name, setName] = useState(meal?.name ?? '');
  const [items, setItems] = useState<DraftItem[]>(() =>
    (meal?.items ?? []).map(({ name: itemName, calories, protein, description }) => ({
      uid: makeUid(),
      name: itemName,
      calories,
      protein,
      description,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Analyze bar state (mirrors ChatInput)
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Snapshot of the initial draft so back only confirms on real changes
  const initialDraftRef = useRef(
    JSON.stringify({
      name: meal?.name ?? '',
      items: (meal?.items ?? []).map(({ name: n, calories, protein, description: d }) => ({ n, calories, protein, d })),
    })
  );
  const isDirty =
    JSON.stringify({
      name,
      items: items.map(({ name: n, calories, protein, description: d }) => ({ n, calories, protein, d })),
    }) !== initialDraftRef.current;

  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = Math.round(items.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;
  const shownCalories = useCountUp(totalCalories);
  const shownProtein = useCountUp(totalProtein, { decimals: 1 });

  const canSave = name.trim().length > 0 && items.length >= 1;

  const handleBack = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Image size must be less than 10MB');
        return;
      }

      try {
        const base64 = await fileToBase64(file);
        setImage(base64);
        setImagePreview(URL.createObjectURL(file));
        setError('');
      } catch (err) {
        setError('Error loading image');
        console.error(err);
      }
    }
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
    const fileInput = document.getElementById('meal-builder-image-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim() && !image) {
      setError('Please provide either a description or an image');
      return;
    }

    setAnalyzing(true);
    setError('');

    try {
      // Check rate limit BEFORE making API call (using abstraction)
      const canProceed = await db.rateLimit.checkFood();

      if (!canProceed) {
        const status = await db.rateLimit.getStatus();
        setError(`Rate limit reached (${status.calls_used}/${status.calls_limit}). Resets at ${new Date(status.resets_at).toLocaleTimeString()}`);
        setAnalyzing(false);
        return;
      }

      // Call API using abstraction (API key is safe on server!)
      const nutritionData = await api.analyzeFood(description, image || undefined);

      // Success - append to the local draft instead of logging
      setItems((prev) => [
        ...prev,
        {
          uid: makeUid(),
          name: nutritionData.name,
          calories: nutritionData.calories,
          protein: nutritionData.protein,
          description: description || nutritionData.name,
        },
      ]);

      // Reset form
      setDescription('');
      setImage(null);
      setImagePreview(null);
      const fileInput = document.getElementById('meal-builder-image-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err) {
      console.error('Food analysis error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze food. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const removeItem = (uid: string) => {
    setItems((prev) => prev.filter((item) => item.uid !== uid));
  };

  const handleSave = async () => {
    if (saving || !canSave) return;

    setSaving(true);
    try {
      const payload: FoodItemInput[] = items.map(({ name: itemName, calories, protein, description: itemDescription }) => ({
        name: itemName,
        calories,
        protein,
        description: itemDescription,
      }));

      const saved = meal
        ? await db.meals.update(meal.id, name.trim(), payload)
        : await db.meals.create(name.trim(), payload);

      toast.success('Meal saved');
      onSaved(saved);
    } catch (err) {
      console.error('Error saving meal:', err);
      toast.error('Could not save meal. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper">
      {/* Header (same chrome as Settings) */}
      <div className="bg-paper-raised border-b border-line px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Back"
            >
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-ink">{meal ? 'Edit Meal' : 'New Meal'}</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Input
            id="meal-builder-name"
            label="Meal name"
            placeholder='e.g. "Chicken curry lunch"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />

          {/* Running totals strip */}
          {items.length >= 1 && (
            <div className="flex items-baseline gap-1.5 animate-fade-in">
              <span className="text-xs text-ink-muted">Total ·</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums text-ink">{shownCalories}</span>
              <span className="text-xs text-ink-muted">cal ·</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums text-ink">{shownProtein}g</span>
              <span className="text-xs text-ink-muted">pro</span>
            </div>
          )}

          {/* Draft items */}
          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
                title="No items yet"
                subtitle="Add your first item below"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-paper-inset/70">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-ink-muted uppercase tracking-wider">Food</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Cal</th>
                    <th className="text-center py-2.5 px-2 text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">Pro</th>
                    <th className="w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.uid} className="border-b border-line/60 last:border-b-0 hover:bg-paper-inset/50 transition-colors animate-entry-in">
                      <td className="py-3 px-3">
                        <div className="font-medium text-ink text-sm">{item.name}</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="text-xs font-semibold text-ink tabular-nums">{item.calories}</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="text-xs font-semibold text-ink tabular-nums">{item.protein}g</div>
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => removeItem(item.uid)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-danger hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
                            title="Remove"
                            aria-label="Remove item"
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
        </div>
      </div>

      {/* Analyze bar + footer (bottom of the builder layout) */}
      <div
        className="bg-paper-raised/70 backdrop-blur-sm border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto px-3 py-3">
          {/* Error Message */}
          {error && (
            <div className="mb-2 bg-danger-soft border border-danger/20 text-danger px-2.5 py-1.5 rounded-ctrl text-xs flex items-start gap-1.5">
              <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Image Preview (if any) */}
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Preview"
                className="h-16 w-16 object-cover rounded-ctrl border border-line"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 p-1 bg-paper-raised text-ink-soft hover:text-danger active:text-danger rounded-full border border-line shadow-card"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Input Bar */}
          <form onSubmit={handleAnalyze} className="flex items-center gap-2">
            {/* Image Upload Button */}
            <label className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center bg-paper-inset hover:bg-paper-deep active:bg-paper-deep text-ink-soft hover:text-ink rounded-ctrl cursor-pointer transition duration-150">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                id="meal-builder-image-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                disabled={analyzing}
              />
            </label>

            {/* Text Input */}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add 1 or multiple items (e.g., 2 rotis, dal, rice)"
              className="flex-1 min-w-0 px-3 py-2.5 border border-line-strong rounded-ctrl focus:outline-none focus:ring-1 focus:ring-ink-muted bg-paper-raised/70 backdrop-blur-sm text-base text-ink placeholder:text-ink-faint transition duration-150"
              disabled={analyzing}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={analyzing || (!description.trim() && !image)}
              className="flex-shrink-0 px-4 min-h-[44px] bg-ink hover:bg-ink-soft text-white rounded-ctrl transition duration-150 ease-out active:scale-[0.98] disabled:bg-ink-faint disabled:cursor-not-allowed disabled:active:scale-100 font-medium text-sm flex items-center gap-1.5"
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="hidden sm:inline">Analyzing...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Send</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer: Save */}
          <div className="mt-2">
            <Button fullWidth onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving...' : 'Save Meal'}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this meal?"
        message="Your changes won't be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
