/**
 * Admin analytics helpers — pure formatting and color functions.
 * Moved verbatim from app/(tabs)/analytics.tsx; only the returned CLASS
 * STRINGS were remapped onto design-system tokens (warn/alert/danger/accent).
 * Thresholds and conditions are character-identical to the originals.
 */

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
};

export const formatDateTime = (dateString: string | null) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Time of a log. Pass the client's IANA timezone to show THEIR clock
 * (the time at which they actually ate); falls back to the viewer's
 * local time when the timezone is unknown or invalid.
 */
export const formatLogTime = (dateString: string, timeZone?: string | null) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (timeZone) {
    try {
      return date.toLocaleTimeString('en-US', { ...options, timeZone });
    } catch {
      // Invalid timezone string — fall through to viewer-local
    }
  }
  return date.toLocaleTimeString('en-US', options);
};

/** 24h variant ("19:04") used for the AI coaching payload */
export const formatLogTime24 = (dateString: string, timeZone?: string | null) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (timeZone) {
    try {
      return date.toLocaleTimeString('en-GB', { ...options, timeZone });
    } catch {
      // Invalid timezone string — fall through to viewer-local
    }
  }
  return date.toLocaleTimeString('en-GB', options);
};

// Gap between two consecutive logs, e.g. "3h 15m"; null if under a minute or invalid
export const formatLogGap = (prevCreatedAt: string, currCreatedAt: string): string | null => {
  const diffMs = new Date(currCreatedAt).getTime() - new Date(prevCreatedAt).getTime();
  if (!isFinite(diffMs) || diffMs < 60 * 1000) return null;
  const totalMins = Math.round(diffMs / (60 * 1000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

export const getTierColor = (tier: string) => {
  switch (tier) {
    case 'admin':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'coach':
      return 'bg-teal-100 text-teal-700 border-teal-200';
    case 'pro':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    default:
      return 'bg-paper-inset text-ink-soft border-line';
  }
};

// Helper function to get color coding for daily calories
// Aligned side: gradual (0-10% green, 10-20% yellow, 20-30% orange, >30% red)
// Non-aligned side: strict (>5% red)
export const getCaloriesColor = (calories: number, target: number, maintenance: number) => {
  if (calories === 0) return 'bg-paper-inset text-ink-muted';

  const isDeficit = target < maintenance;  // Cutting
  const isSurplus = target > maintenance;  // Bulking

  const diff = calories - target;
  const percentDiff = (diff / target) * 100;  // Positive = above, negative = below

  // Determine if we're on the "aligned" side (good direction)
  const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

  if (isAligned) {
    // ALIGNED SIDE (good direction) - Gradual thresholds
    const absDiff = Math.abs(percentDiff);
    if (absDiff <= 10) return 'bg-accent-100 text-accent-700';      // 0-10%
    if (absDiff <= 20) return 'bg-warn-soft text-warn';    // 10-20%
    if (absDiff <= 30) return 'bg-alert-soft text-alert';    // 20-30%
    return 'bg-danger-soft text-danger';                             // >30%
  } else {
    // NON-ALIGNED SIDE (bad direction) - Strict threshold
    const absDiff = Math.abs(percentDiff);
    if (absDiff <= 5) return 'bg-accent-100 text-accent-700';       // 0-5% tolerance
    return 'bg-danger-soft text-danger';                             // >5%
  }
};

// Helper function to get color coding for daily protein
// 0-10% green (the gate's protein floor carries the same 10% grace),
// 10-20% yellow, 20-30% orange, >30% red
export const getProteinColor = (protein: number, target: number) => {
  if (protein === 0) return 'bg-paper-inset text-ink-muted';

  // Calculate percentage below target
  const percentBelow = ((target - protein) / target) * 100;

  // Green: at or above target, or 0-10% below
  if (percentBelow <= 10) return 'bg-accent-100 text-accent-700';    // 0-10% below

  // Yellow: 10-20% below target
  if (percentBelow <= 20) return 'bg-warn-soft text-warn';  // 10-20% below

  // Orange: 20-30% below target
  if (percentBelow <= 30) return 'bg-alert-soft text-alert';  // 20-30% below

  // Red: more than 30% below target
  return 'bg-danger-soft text-danger';                                // >30% below
};

// Calculate deficit/surplus status and color
export const getDeficitDisplay = (dailyDeficit: number, targetCal: number, maintenance: number) => {
  const isCutting = targetCal < maintenance;
  const isBulking = targetCal > maintenance;
  const isDeficit = dailyDeficit < 0;
  const isSurplus = dailyDeficit > 0;

  let color = 'text-ink-soft';
  let label = 'Maintenance';

  if (isDeficit) {
    // In deficit
    label = `${Math.abs(dailyDeficit)} cal deficit`;
    color = (isCutting) ? 'text-accent-700' : 'text-danger';
  } else if (isSurplus) {
    // In surplus
    label = `${Math.abs(dailyDeficit)} cal surplus`;
    color = (isBulking) ? 'text-accent-700' : 'text-danger';
  }

  return { label, color };
};
