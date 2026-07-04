/**
 * Settings Screen - User Settings Configuration
 * ABSTRACTION: Uses db.settings and db.rateLimit APIs, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { db } from '@/lib/database';
import { toast } from '@/lib/toast';
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
      <div className="flex items-center justify-center h-screen bg-gray-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-xl border border-gray-200 p-6 shadow-sm text-center">
          <p className="text-sm font-semibold text-gray-900 mb-1">Couldn&apos;t load settings</p>
          <p className="text-xs text-gray-500 mb-4">Check your connection and try again.</p>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex-1 min-h-[44px] bg-black hover:bg-gray-800 active:bg-gray-700 text-white px-4 rounded-lg transition-all font-medium text-sm"
            >
              Retry
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 min-h-[44px] bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900 px-4 rounded-lg transition-all font-medium text-sm"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !settings || !rateLimitStatus) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex items-center gap-2 text-gray-400">
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
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-all"
              aria-label="Back"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">Settings</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Settings Form */}
          <div className="space-y-4">
            {fields.map(({ key, label, unit, hint }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    disabled={saving}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-1 bg-white text-gray-900 font-medium text-sm ${
                      fieldErrors[key]
                        ? 'border-red-300 focus:ring-red-400'
                        : 'border-gray-300 focus:ring-gray-400'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                    {unit}
                  </div>
                </div>
                {fieldErrors[key] ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">{hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 min-h-[44px] bg-black hover:bg-gray-800 active:bg-gray-700 text-white py-2.5 px-4 rounded-lg transition-all font-medium text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => router.back()}
              disabled={saving}
              className="flex-1 min-h-[44px] bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900 py-2.5 px-4 rounded-lg transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
