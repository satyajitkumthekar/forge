/**
 * Tabs Layout - Main App Navigation
 */

import React, { useEffect, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { tokens } from '@/lib/design-tokens';
import { useAuth } from '../../contexts/AuthContext';
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
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(
    () => getCached<string>(CACHE_KEYS.accountType) === 'admin'
  );

  // Check if user is admin (cache-first, revalidate in background)
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const status = await db.rateLimit.getStatus();
        setCached(CACHE_KEYS.accountType, status.account_type, ACCOUNT_TYPE_TTL);
        setIsAdmin(status.account_type === 'admin');
      } catch (err) {
        console.error('Error checking admin status:', err);
      }
    };

    checkAdminStatus();
  }, []);

  const handleSettings = () => {
    router.push('/settings');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const getHeaderRight = () => (
    <View style={{ flexDirection: 'row', gap: 8, marginRight: 12 }}>
      <Pressable
        onPress={handleSettings}
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
      >
        <FontAwesome name="cog" size={20} color={tokens.colors.ink.DEFAULT} />
      </Pressable>
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
      >
        <FontAwesome name="sign-out" size={20} color={tokens.colors.ink.DEFAULT} />
      </Pressable>
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tokens.colors.ink.DEFAULT,
        tabBarInactiveTintColor: tokens.colors.ink.muted,
        tabBarStyle: {
          backgroundColor: tokens.colors.paper.raised,
          borderTopWidth: 1,
          borderTopColor: tokens.colors.line.DEFAULT,
        },
        headerStyle: {
          backgroundColor: tokens.colors.paper.raised,
          borderBottomWidth: 1,
          borderBottomColor: tokens.colors.line.DEFAULT,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          color: tokens.colors.ink.DEFAULT,
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
          headerRight: getHeaderRight,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color }) => <CoachIcon color={color} />,
          headerRight: getHeaderRight,
          href: null, // Hidden for all users
        }}
      />
      <Tabs.Screen
        name="feedback"
        options={{
          title: 'Feedback',
          tabBarIcon: ({ color }) => <FeedbackIcon color={color} />,
          headerRight: getHeaderRight,
          href: null, // Hidden for all users
        }}
      />
      {/* Admin-only Tab */}
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color }) => <AnalyticsIcon color={color} />,
          headerRight: getHeaderRight,
          href: isAdmin ? undefined : null,
        }}
      />
    </Tabs>
  );
}
