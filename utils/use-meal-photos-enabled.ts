/**
 * useMealPhotosEnabled - whether staff have switched on meal photos for the
 * signed-in client (user_profiles.meal_photos_enabled). Off by default.
 *
 * Same shape as useMacrosHidden: reads the per-user cache synchronously so
 * the photo rows never flash in or out on open, then revalidates in the
 * background with one shared fetch for every mounted screen.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';

const listeners = new Set<(enabled: boolean) => void>();
let inflight: Promise<void> | null = null;

export const readMealPhotosEnabled = (): boolean => getCached<boolean>(CACHE_KEYS.mealPhotosEnabled) === true;

export function refreshMealPhotosEnabled(): Promise<void> {
  if (!inflight) {
    inflight = db.access
      .getMealPhotosEnabled()
      .then((enabled) => {
        setCached(CACHE_KEYS.mealPhotosEnabled, enabled);
        listeners.forEach((listener) => listener(enabled));
      })
      .catch(() => {
        // Keep the last known value; the next screen open retries
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useMealPhotosEnabled(): boolean {
  const [enabled, setEnabled] = useState(readMealPhotosEnabled);

  useEffect(() => {
    listeners.add(setEnabled);
    refreshMealPhotosEnabled();
    return () => {
      listeners.delete(setEnabled);
    };
  }, []);

  return enabled;
}
