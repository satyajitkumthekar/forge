/**
 * Holding Screen - shown to signed-in users whose access hasn't been
 * granted yet (and to anyone the coach boots). Access is granted personally
 * from the admin panel; there is no queue position anymore.
 */

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';

export default function WaitlistScreen() {
  const { user } = useAuth();

  return (
    <div className="min-h-[calc(100dvh-var(--safe-top))] bg-paper flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-6 bg-ink rounded-card flex items-center justify-center">
          <span className="text-white text-2xl font-bold tracking-tight">SL</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-ink mb-3">Request received</h1>

        <p className="text-base text-ink-soft mb-8 leading-relaxed">
          Superhuman Lab access is granted personally. You are on the list, and the moment your
          access is approved this screen lets you straight in.
        </p>

        {/* Email display */}
        <div className="bg-paper-inset border border-line rounded-card p-5 mb-8">
          <p className="text-xs text-ink-muted mb-1">Signed up as</p>
          <p className="text-base text-ink font-medium">{user?.email}</p>
        </div>

        <Button fullWidth onClick={() => window.location.reload()}>
          Check again
        </Button>

        <div className="flex items-center justify-center gap-2 mt-6">
          <span className="w-2 h-2 bg-warn rounded-full" />
          <span className="text-sm text-ink-muted">Awaiting approval</span>
        </div>
      </div>
    </div>
  );
}
