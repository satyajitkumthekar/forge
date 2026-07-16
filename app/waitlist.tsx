/**
 * Holding Screen - shown to signed-in users whose access hasn't been
 * granted yet (and to anyone the coach boots). Access is granted personally
 * from the admin panel, or instantly with an access code.
 */

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function WaitlistScreen() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  const handleRedeem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (redeeming || !code.trim()) return;

    setRedeeming(true);
    setRedeemError('');
    try {
      const ok = await db.access.redeemPass(code.trim());
      if (ok) {
        // Head to the app root: the access gate re-checks there and lets
        // them in. Reloading /waitlist would strand them on this screen —
        // the guard only ever pushes people ONTO it, never off it.
        window.location.href = '/';
        return;
      }
      setRedeemError("That code didn't work. Check it and try again.");
    } catch (err) {
      console.error('Error redeeming access code:', err);
      setRedeemError("Couldn't check the code. Try again in a moment.");
    } finally {
      setRedeeming(false);
    }
  };

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

        {/* Access code */}
        <div className="bg-paper-raised border border-line rounded-card p-5 mb-4 text-left">
          <p className="text-sm font-semibold text-ink mb-3">Have an access code?</p>
          <form onSubmit={handleRedeem} className="flex items-start gap-2" noValidate>
            <div className="flex-1">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. SUMMER10"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={redeeming}
                error={redeemError || undefined}
              />
            </div>
            <Button type="submit" disabled={redeeming || !code.trim()}>
              {redeeming ? '...' : 'Enter'}
            </Button>
          </form>
        </div>

        {/* Email display */}
        <div className="bg-paper-inset border border-line rounded-card p-5 mb-8">
          <p className="text-xs text-ink-muted mb-1">Signed up as</p>
          <p className="text-base text-ink font-medium">{user?.email}</p>
        </div>

        <Button variant="secondary" fullWidth onClick={() => { window.location.href = '/'; }}>
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
