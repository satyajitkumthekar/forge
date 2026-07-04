/**
 * Maps raw Supabase auth error messages to friendly user-facing copy.
 */

export const friendlyAuthError = (error: { message?: string } | null | undefined): string => {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox.';
  if (/user already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/network|fetch/i.test(msg)) return 'Connection problem. Check your internet and try again.';
  // Password guidance from Supabase is actionable and readable — pass it through
  if (/password/i.test(msg)) return msg;
  return 'Something went wrong. Please try again.';
};
