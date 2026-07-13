/**
 * Tabs Layout - Main App Navigation
 * Native headers are disabled; each visible screen renders its own frosted
 * in-page header (settings/sign-out live there, not in headerRight).
 */

import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { tokens } from '@/lib/design-tokens';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import Svg, { Path } from 'react-native-svg';

// Account type changes rarely; cache it so the Admin tab doesn't pop in
// after an async round-trip on every mount
const ACCOUNT_TYPE_TTL = 60 * 60 * 1000;

// Custom modern icon components
const TrackIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" fill={color} />
  </Svg>
);

const DashboardIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill={color} />
  </Svg>
);

const MealsIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" fill={color} />
  </Svg>
);

const CoachIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-2v2h-2v-2H9V9h2V7h2v2h4v2z" fill={color} />
  </Svg>
);

const FeedbackIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={color} />
  </Svg>
);

const AnalyticsIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" fill={color} />
  </Svg>
);

export default function TabLayout() {
  // 'admin' and 'coach' both get the staff tab; a coach's copy is scoped
  // to their assigned clients and titled "Clients"
  const [accountType, setAccountType] = useState<string | null>(
    () => getCached<string>(CACHE_KEYS.accountType)
  );

  // Check the account tier (cache-first, revalidate in background)
  useEffect(() => {
    const checkAccountType = async () => {
      try {
        const status = await db.rateLimit.getStatus();
        setCached(CACHE_KEYS.accountType, status.account_type, ACCOUNT_TYPE_TTL);
        setAccountType(status.account_type);
      } catch (err) {
        console.error('Error checking account type:', err);
      }
    };

    checkAccountType();
  }, []);

  const isStaff = accountType === 'admin' || accountType === 'coach';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.colors.ink.DEFAULT,
        tabBarInactiveTintColor: tokens.colors.ink.muted,
        tabBarStyle: {
          backgroundColor: tokens.colors.paper.raised,
          borderTopWidth: 1,
          borderTopColor: tokens.colors.line.DEFAULT,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Track',
          tabBarIcon: ({ color }) => <TrackIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <DashboardIcon color={color} />,
          href: null, // Hidden — replaced by the Track calendar; screen kept because utils are shared with admin
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Meals',
          tabBarIcon: ({ color }) => <MealsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color }) => <CoachIcon color={color} />,
          href: null, // Hidden for all users
        }}
      />
      <Tabs.Screen
        name="feedback"
        options={{
          title: 'Feedback',
          tabBarIcon: ({ color }) => <FeedbackIcon color={color} />,
          href: null, // Hidden for all users
        }}
      />
      {/* Staff-only Tab: the full dashboard for admins, scoped clients for coaches */}
      <Tabs.Screen
        name="analytics"
        options={{
          title: accountType === 'coach' ? 'Clients' : 'Admin',
          tabBarIcon: ({ color }) => <AnalyticsIcon color={color} />,
          href: isStaff ? undefined : null,
        }}
      />
    </Tabs>
  );
}
