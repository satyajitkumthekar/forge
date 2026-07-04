/**
 * Settings Screen - User Settings Configuration
 * ABSTRACTION: Uses db.settings and db.rateLimit APIs, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { db } from '@/lib/database';
import { toast } from '@/lib/toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { UserSettings, RateLimitStatus } from '@/types';

// Sanity bounds; values outside these are almost certainly typos
const LIMITS = {
  target_calories: { min: 500, max: 10000, label: 'Target calories' },
  maintenance_calories: { min: 500, max: 10000, label: 'Maintenance calories' },
  target_protein: { min: 20, max: 400, label: 'Target protein' },
} as const;

type FieldKey = keyof typeof LIMITS;

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
  // Fields held as strings so clearing/typing doesn't coerce to 0 mid-edit
  const [form, setForm] = useState<Record<FieldKey, string>>({
    target_calories: '',
    maintenance_calories: '',
    target_protein: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [loadedSettings, limitStatus] = await Promise.all([
        db.settings.get(),
        db.rateLimit.getStatus(),
      ]);

      setSettings(loadedSettings);
      setRateLimitStatus(limitStatus);
      setForm({
        target_calories: String(loadedSettings.target_calories),
        maintenance_calories: String(loadedSettings.maintenance_calories),
        target_protein: String(loadedSettings.target_protein),
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const validate = (): Record<FieldKey, number> | null => {
    const errors: Partial<Record<FieldKey, string>> = {};
    const values = {} as Record<FieldKey, number>;

    (Object.keys(LIMITS) as FieldKey[]).forEach((key) => {
      const { min, max, label } = LIMITS[key];
      const parsed = parseInt(form[key], 10);
      if (form[key].trim() === '' || isNaN(parsed)) {
        errors[key] = `${label} is required`;
      } else if (parsed < min || parsed > max) {
        errors[key] = `${label} must be between ${min} and ${max}`;
      } else {
        values[key] = parsed;
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length > 0 ? null : values;
  };

  const handleSave = async () => {
    if (saving) return;

    const values = validate();
    if (!values) return;

    setSaving(true);
    try {
      await db.settings.update(values);

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        router.back();
      }, 1500);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Could not save settings. Please try again.');
      setSaving(false);
    }
  };

  const updateField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper p-6">
        <div className="max-w-sm w-full bg-paper-raised rounded-card border border-line p-6 shadow-card text-center">
          <p className="text-sm font-semibold text-ink mb-1">Couldn&apos;t load settings</p>
          <p className="text-xs text-ink-muted mb-4">Check your connection and try again.</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={loadData}>
              Retry
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !settings || !rateLimitStatus) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <div className="flex items-center gap-2 text-ink-faint">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const fields: { key: FieldKey; label: string; unit: string; hint: string }[] = [
    { key: 'target_calories', label: 'Target Calories', unit: 'cal/day', hint: 'Your daily calorie intake goal' },
    { key: 'maintenance_calories', label: 'Maintenance Calories', unit: 'cal/day', hint: 'Calories to maintain your current weight' },
    { key: 'target_protein', label: 'Target Protein', unit: 'g/day', hint: 'Your daily protein goal in grams' },
  ];

  return (
    <div className="flex flex-col h-screen bg-paper">
      {/* Header */}
      <div className="bg-paper-raised border-b border-line px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Back"
            >
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-ink">Settings</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Settings Form */}
          <div className="space-y-4">
            {fields.map(({ key, label, unit, hint }) => (
              <Input
                key={key}
                id={key}
                type="number"
                inputMode="numeric"
                label={label}
                unit={unit}
                hint={hint}
                error={fieldErrors[key]}
                value={form[key]}
                onChange={(e) => updateField(key, e.target.value)}
                disabled={saving}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => router.back()} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
