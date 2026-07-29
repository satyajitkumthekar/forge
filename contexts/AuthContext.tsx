/**
 * Auth Context - Authentication State Management
 * ABSTRACTION: Wraps Supabase auth, provides clean API to components
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { setCacheUser, clearUserCache } from '../lib/enhanced-cache';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any; data: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any; data: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        let activeSession = session;
        if (session) {
          // A restored session can point at a deleted account or a revoked
          // token, and the stored expiry can't be trusted (it was computed
          // with the device clock). Ask the server before accepting it, but
          // only drop the session on an explicit rejection — a network
          // failure here must not sign out an offline user.
          const { error: userError } = await supabase.auth.getUser();
          const status = (userError as { status?: number } | null)?.status;
          if (status === 401 || status === 403) {
            // A merely stale token heals with a server-checked renewal;
            // only a dead session (deleted account, revoked refresh token)
            // fails it and warrants signing out
            const { data: refreshData, error: refreshError } =
              await supabase.auth.refreshSession();
            if (refreshError || !refreshData.session) {
              await supabase.auth.signOut();
              setCacheUser(null);
              setUser(null);
              setLoading(false);
              return;
            }
            activeSession = refreshData.session;
          }
        }
        setCacheUser(activeSession?.user?.id ?? null);
        setUser(activeSession?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        // Without this, a failed session fetch leaves the app on a blank
        // screen forever (loading never flips false)
        console.error('[Auth] Failed to restore session:', err);
        setUser(null);
        setLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Clear the signed-out user's cached data (entries, settings, chat)
        // BEFORE unbinding, so nothing lingers on shared devices
        clearUserCache();
      }
      setCacheUser(session?.user?.id ?? null);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // The profile-creation trigger copies this into user_profiles.full_name
          data: { full_name: fullName.trim() },
        },
      });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
