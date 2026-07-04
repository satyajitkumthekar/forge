/**
 * Sign Up Screen
 * ABSTRACTION: Uses AuthContext, not Supabase directly
 */

import React, { useState } from 'react';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyAuthError } from '@/lib/auth-errors';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { signUp } = useAuth();

  const handleSignUp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      setError(friendlyAuthError(signUpError));
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100dvh-var(--safe-top))] bg-paper flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm bg-paper-raised rounded-card border border-line shadow-card p-6 text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 bg-accent-50 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink mb-2">Check Your Email</h1>
          <p className="text-sm text-ink-muted mb-6">
            We&apos;ve sent you a confirmation link. Please check your email to verify your account.
          </p>
          <Link href="/sign-in" className="block">
            <Button fullWidth>Back to Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-var(--safe-top))] bg-paper flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-ink rounded-card flex items-center justify-center mb-4">
            <span className="text-white text-2xl font-bold tracking-tight">FT</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Create Account</h1>
          <p className="text-sm text-ink-muted mt-2">Start tracking your nutrition with AI</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignUp} className="space-y-4" noValidate>
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="your@email.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="••••••••"
            autoComplete="new-password"
            hint="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <Input
            id="confirm-password"
            type="password"
            label="Confirm Password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />

          {error ? (
            <div className="bg-danger-soft border border-danger/20 rounded-ctrl p-3 animate-fade-in">
              <p className="text-danger text-sm">{error}</p>
            </div>
          ) : null}

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating account...
              </>
            ) : (
              'Sign Up'
            )}
          </Button>

          <p className="text-center text-sm text-ink-muted pt-2">
            Already have an account?{' '}
            <Link href="/sign-in" className="text-ink font-semibold hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
