/**
 * Tabs Layout - Main App Navigation
 */

import React, { useEffect, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { HStack } from '@gluestack-ui/themed';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '@/lib/database';
import Svg, { Path } from 'react-native-svg';

// Custom modern icon components
const TrackIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
      fill={color}
    />
  </Svg>
);

const DashboardIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill={color} />
  </Svg>
);

const CoachIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-2v2h-2v-2H9V9h2V7h2v2h4v2z"
      fill={color}
    />
  </Svg>
);

const FeedbackIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      fill={color}
    />
  </Svg>
);

const AnalyticsIcon = ({ color }: { color: string }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"
      fill={color}
    />
  </Svg>
);

export default function TabLayout() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const status = await db.rateLimit.getStatus();
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
    <HStack space="sm" mr="$3">
      <Pressable
        onPress={handleSettings}
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
      >
        <FontAwesome name="cog" size={20} color="#000" />
      </Pressable>
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}
      >
        <FontAwesome name="sign-out" size={20} color="#000" />
      </Pressable>
    </HStack>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#000',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
        headerStyle: {
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
        },
        headerTitleStyle: {
          fontWeight: 'bold',
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
