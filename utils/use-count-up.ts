/**
 * useCountUp - animates a displayed number toward its target value.
 * Display-only: never use the returned value for computation.
 * Bails instantly on SSR and prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from 'react';

interface CountUpOptions {
  duration?: number;
  decimals?: number;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function useCountUp(target: number, { duration = 500, decimals = 0 }: CountUpOptions = {}): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;

    const factor = 10 ** decimals;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const value = Math.round((from + (target - from) * easeOutCubic(t)) * factor) / factor;
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, decimals]);

  return display;
}
