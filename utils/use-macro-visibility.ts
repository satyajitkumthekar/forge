/**
 * useMacroVisibility - which of the four numbers (calories, protein, carbs,
 * fat) staff let the signed-in client see (user_profiles.show_*).
 * Defaults: calories and protein on, carbs and fat off.
 *
 * Reads the per-user cache synchronously so screens never flash a number
 * that is switched off, then revalidates in the background. One shared
 * fetch serves every mounted screen; all of them update together.
 */

import { useEffect, useState } from 'react';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { sameVisibility, visibilityFromLegacyHidden } from '@/utils/macros';
import type { MacroVisibility } from '@/types';

const listeners = new Set<(visibility: MacroVisibility) => void>();
let inflight: Promise<void> | null = null;

export function readMacroVisibility(): MacroVisibility {
  const cached = getCached<MacroVisibility>(CACHE_KEYS.macroVisibility);
  if (cached) return cached;
  // First open after the four switches arrived: nothing is cached under the
  // new key yet, so honour the older single flag. A client whose numbers
  // were hidden never sees them flash while the switches load.
  return visibilityFromLegacyHidden(getCached<boolean>(CACHE_KEYS.macrosHidden) === true);
}

export function refreshMacroVisibility(): Promise<void> {
  if (!inflight) {
    inflight = db.access
      .getMacroVisibility()
      .then((fresh) => {
        const previous = readMacroVisibility();
        setCached(CACHE_KEYS.macroVisibility, fresh);
        if (!sameVisibility(previous, fresh)) {
          listeners.forEach((listener) => listener(fresh));
        }
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

export function useMacroVisibility(): MacroVisibility {
  const [visibility, setVisibility] = useState(readMacroVisibility);

  useEffect(() => {
    listeners.add(setVisibility);
    refreshMacroVisibility();
    return () => {
      listeners.delete(setVisibility);
    };
  }, []);

  return visibility;
}
