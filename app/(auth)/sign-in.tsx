/**
 * Sign In Screen
 * ABSTRACTION: Uses AuthContext, not Supabase directly
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyAuthError } from '@/lib/auth-errors';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signIn } = useAuth();
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (failsafeRef.current) clearTimeout(failsafeRef.current);
    };
  }, []);

  const handleSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(friendlyAuthError(signInError));
      setLoading(false);
      return;
    }

    // Success: AuthContext + root layout handle the redirect. If it hasn't
    // happened after 10s (e.g. access check failing), stop spinning forever.
    failsafeRef.current = setTimeout(() => {
      setLoading(false);
      setError('Taking longer than expected. Please try again.');
    }, 10000);
  };

  return (
    <div className="min-h-[calc(100dvh-var(--safe-top))] bg-paper flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-ink rounded-card flex items-center justify-center mb-4">
            <span className="text-white text-2xl font-bold tracking-tight">SL</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Superhuman Lab</h1>
          <p className="text-sm text-ink-muted mt-2">Track your nutrition with AI</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-4" noValidate>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>

          <p className="text-center text-sm text-ink-muted pt-2">
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" className="text-ink font-semibold hover:underline">
              Sign Up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
