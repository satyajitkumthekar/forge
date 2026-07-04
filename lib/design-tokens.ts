/**
 * Design Tokens - typed re-export of the canonical tokens.
 *
 * The values live in lib/tokens.js (plain CommonJS so tailwind.config.js can
 * require them at build time). Import `tokens` here when component code needs
 * raw values — chart props, SVG strokes, RN style objects. In className
 * strings, use the Tailwind classes (bg-paper, text-ink, border-line, ...).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rawTokens = require('./tokens') as {
  colors: {
    paper: { DEFAULT: string; raised: string; inset: string; deep: string };
    line: { DEFAULT: string; strong: string };
    ink: { DEFAULT: string; soft: string; muted: string; faint: string };
    accent: { 50: string; 100: string; 500: string; 600: string; 700: string };
    warn: { DEFAULT: string; soft: string };
    alert: { DEFAULT: string; soft: string };
    danger: { DEFAULT: string; soft: string };
  };
  radii: { card: string; ctrl: string };
  shadows: { card: string; overlay: string };
};

export const tokens = rawTokens;
