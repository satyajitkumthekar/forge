/**
 * useMacrosHidden - whether staff have hidden calorie & protein numbers
 * from the signed-in client (user_profiles.macros_hidden).
 *
 * Reads the per-user cache synchronously so screens never flash numbers
 * on open, then revalidates in the background. One shared fetch serves
 * every mounted screen; all of them update together.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';

const listeners = new Set<(hidden: boolean) => void>();
let inflight: Promise<void> | null = null;

export const readMacrosHidden = (): boolean => getCached<boolean>(CACHE_KEYS.macrosHidden) === true;

export function refreshMacrosHidden(): Promise<void> {
  if (!inflight) {
    inflight = db.access
      .getMacrosHidden()
      .then((hidden) => {
        setCached(CACHE_KEYS.macrosHidden, hidden);
        listeners.forEach((listener) => listener(hidden));
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

export function useMacrosHidden(): boolean {
  const [hidden, setHidden] = useState(readMacrosHidden);

  useEffect(() => {
    listeners.add(setHidden);
    refreshMacrosHidden();
    return () => {
      listeners.delete(setHidden);
    };
  }, []);

  return hidden;
}
