/**
 * Design Tokens - single source of truth for the app's visual language.
 *
 * Plain CommonJS so tailwind.config.js can require() it at build time;
 * component code imports the typed re-exports from lib/design-tokens.ts.
 *
 * Language: eggshell "paper" surfaces, warm near-black "ink" text, warm
 * hairline "line" borders, and ONE green ("accent") reserved for on-target
 * status — primary actions stay ink.
 */

const colors = {
  paper: {
    DEFAULT: '#FAF9F6', // page background (eggshell)
    raised: '#FFFFFF', // cards, sheets
    inset: '#F4F1EA', // wells, secondary buttons, table headers
    deep: '#EDE9E0', // pressed states, strong wells
  },
  line: {
    DEFAULT: '#E7E2D9', // hairline borders
    strong: '#D8D2C6', // input borders, emphasized dividers
  },
  ink: {
    DEFAULT: '#1F1C18', // headings, primary buttons
    soft: '#57524A', // body text
    muted: '#8A8378', // secondary text, labels
    faint: '#B4AEA2', // placeholders, disabled text
  },
  accent: {
    50: '#E9F6F1',
    100: '#CFEDE2',
    500: '#10A37F', // THE green — on-target status only
    600: '#0D8A6B',
    700: '#0A6E56',
  },
  warn: { DEFAULT: '#D97706', soft: '#FEF3C7' }, // 10-20% off target
  alert: { DEFAULT: '#EA580C', soft: '#FFEDD5' }, // 20-30% off target
  danger: { DEFAULT: '#DC2626', soft: '#FEE2E2' }, // >30% off / destructive
};

const radii = {
  card: '16px',
  ctrl: '12px', // buttons, inputs
};

// Two-layer shadows: tight ambient contact + soft key light
const shadows = {
  card: '0 1px 2px rgba(31, 28, 24, 0.04), 0 6px 16px -6px rgba(31, 28, 24, 0.10)',
  overlay: '0 2px 8px rgba(31, 28, 24, 0.08), 0 20px 48px -12px rgba(31, 28, 24, 0.22)',
};

const fonts = {
  sans: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
};

module.exports = { colors, radii, shadows, fonts };
