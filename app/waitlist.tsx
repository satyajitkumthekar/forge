/**
 * Waitlist Screen - Shown to users who don't have access yet
 * Shows user's position in line and estimated wait info
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import Button from '@/components/ui/Button';
import type { UserPositionInfo } from '@/types';

export default function WaitlistScreen() {
  const { user } = useAuth();
  const [positionInfo, setPositionInfo] = useState<UserPositionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWaitlistInfo = async () => {
    setLoading(true);
    try {
      const info = await db.access.getUserPosition();
      setPositionInfo(info);
    } catch (err) {
      console.error('Error loading waitlist info:', err);
      setPositionInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWaitlistInfo();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="flex items-center gap-2 text-ink-faint">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Position couldn't be loaded — never render "#undefined" to a prospect
  if (!positionInfo) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-paper-raised rounded-card border border-line shadow-card p-6 text-center">
          <div className="text-4xl mb-4">🚀</div>
          <h1 className="text-xl font-bold tracking-tight text-ink mb-2">You&apos;re on the list!</h1>
          <p className="text-sm text-ink-muted mb-6">
            We couldn&apos;t load your position right now. Check your connection and try again.
          </p>
          <Button fullWidth onClick={loadWaitlistInfo}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="text-5xl mb-6">🚀</div>

        <h1 className="text-3xl font-bold tracking-tight text-ink mb-6">You&apos;re on the list!</h1>

        {/* Position card */}
        <div className="bg-paper-raised rounded-card border border-line shadow-card px-8 py-6 mb-8 inline-block">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
            Your Position
          </p>
          <p className="text-7xl font-bold tracking-tight text-ink tabular-nums">
            #{positionInfo.rank}
          </p>
        </div>

        {/* Description */}
        <div className="space-y-3 mb-8">
          <p className="text-base font-medium text-ink-soft">
            We&apos;re letting people in gradually.
          </p>
          <p className="text-sm text-ink-muted">
            Currently allowing the first{' '}
            <span className="font-semibold text-ink">{positionInfo.maxAllowed}</span> users.
          </p>
          <p className="text-sm text-ink-muted">
            You&apos;re secured in line and will get instant access when we expand capacity.
          </p>
        </div>

        {/* Email display */}
        <div className="bg-paper-inset border border-line rounded-card p-5 mb-8">
          <p className="text-xs text-ink-muted mb-1">We&apos;ll notify you at</p>
          <p className="text-base text-ink font-medium">{user?.email}</p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-accent-500 rounded-full" />
          <span className="text-sm text-ink-muted">Your spot is secured</span>
        </div>
      </div>
    </div>
  );
}
