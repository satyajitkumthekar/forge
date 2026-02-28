/**
 * Design Tokens - Centralized Design System
 * Use these constants throughout the app for consistency
 */

// ============================================
// SPACING SCALE
// ============================================
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

// ============================================
// TYPOGRAPHY SCALE
// ============================================
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const lineHeight = {
  tight: 1.2, // For headings
  normal: 1.5, // For body text
  relaxed: 1.75, // For long-form content
} as const;

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// ============================================
// BORDER RADIUS
// ============================================
export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

// ============================================
// COLORS - Semantic Tokens
// ============================================
export const colors = {
  // Primary
  primary: '#000000',
  primaryHover: '#1F2937',
  primaryDisabled: '#D1D5DB',

  // Background
  background: '#F9FAFB',
  backgroundLight: '#FFFFFF',
  backgroundDark: '#F3F4F6',

  // Text
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#6B7280',
  textQuaternary: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Border
  borderLight: '#E5E7EB',
  borderMedium: '#D1D5DB',
  borderDark: '#9CA3AF',

  // Status
  success: '#10B981',
  successBg: '#D1FAE5',
  successText: '#065F46',

  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  warningText: '#92400E',

  error: '#EF4444',
  errorBg: '#FEE2E2',
  errorText: '#991B1B',

  info: '#3B82F6',
  infoBg: '#DBEAFE',
  infoText: '#1E40AF',

  // Charts
  chartGreen: '#4ADE80',
  chartRed: '#F87171',
  chartAmber: '#FBBF24',
  chartBlue: '#60A5FA',
  chartPurple: '#A78BFA',

  // Admin
  adminPrimary: '#7C3AED',
  adminBg: '#F3E8FF',

  // Pro tier
  proPrimary: '#2563EB',
  proBg: '#DBEAFE',
} as const;

// ============================================
// SHADOWS - Elevation System
// ============================================
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
} as const;

// ============================================
// RESPONSIVE BREAKPOINTS
// ============================================
export const breakpoints = {
  base: 0, // Mobile
  sm: 640, // Large mobile
  md: 768, // Tablet
  lg: 1024, // Desktop
  xl: 1280, // Large desktop
  '2xl': 1536, // Extra large
} as const;

// ============================================
// LAYOUT CONSTRAINTS
// ============================================
export const maxWidth = {
  form: 600, // Forms and modals
  content: 896, // Main content areas (7xl in Tailwind)
  wide: 1280, // Wide layouts
  full: 1536, // Full width constrained
} as const;

// ============================================
// TOUCH TARGETS
// ============================================
export const touchTarget = {
  minimum: 44, // iOS minimum recommended
  comfortable: 48,
  large: 56,
} as const;

// ============================================
// TRANSITIONS
// ============================================
export const transitions = {
  fast: '0.15s',
  normal: '0.3s',
  slow: '0.5s',
} as const;

// ============================================
// Z-INDEX SCALE
// ============================================
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  modal: 30,
  popover: 40,
  toast: 50,
  tooltip: 60,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get responsive padding values
 * Usage: getResponsivePadding('md', 'lg', 'xl')
 */
export const getResponsivePadding = (
  mobile: keyof typeof spacing,
  tablet: keyof typeof spacing,
  desktop: keyof typeof spacing,
) => ({
  base: spacing[mobile],
  md: spacing[tablet],
  lg: spacing[desktop],
});

/**
 * Get responsive font sizes
 * Usage: getResponsiveFontSize('sm', 'base', 'lg')
 */
export const getResponsiveFontSize = (
  mobile: keyof typeof fontSize,
  tablet: keyof typeof fontSize,
  desktop: keyof typeof fontSize,
) => ({
  base: fontSize[mobile],
  md: fontSize[tablet],
  lg: fontSize[desktop],
});

/**
 * Create consistent card styles
 */
export const cardStyles = {
  base: {
    bg: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  elevated: {
    bg: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  interactive: {
    bg: colors.backgroundLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
    transition: `all ${transitions.fast}`,
  },
} as const;

/**
 * Create consistent button styles
 */
export const buttonStyles = {
  primary: {
    bg: colors.primary,
    borderRadius: borderRadius.md,
    px: spacing.xl,
    py: spacing.md,
  },
  secondary: {
    bg: colors.backgroundDark,
    borderRadius: borderRadius.md,
    px: spacing.xl,
    py: spacing.md,
  },
  ghost: {
    bg: 'transparent',
    borderRadius: borderRadius.md,
    px: spacing.lg,
    py: spacing.sm,
  },
} as const;

/**
 * Create consistent input styles
 */
export const inputStyles = {
  base: {
    borderColor: colors.borderMedium,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    fontSize: fontSize.sm,
    px: spacing.md,
    py: spacing.md,
  },
} as const;
