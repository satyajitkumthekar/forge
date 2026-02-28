import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '../gluestack-ui.config';
import Head from 'expo-router/head';
import { Platform } from 'react-native';
import './global.css';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { db } from '@/lib/database';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Register service worker for PWA (web only)
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <GluestackUIProvider config={config}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GluestackUIProvider>
  );
}

function useProtectedRoute(user: any) {
  const segments = useSegments();
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);

  // Check access when user changes
  useEffect(() => {
    const checkAccess = async () => {
      if (!user) {
        setHasAccess(null);
        return;
      }

      setCheckingAccess(true);
      try {
        const access = await db.access.check();
        setHasAccess(access);
      } catch (err) {
        console.error('Error checking access:', err);
        setHasAccess(true); // Default to true on error to avoid locking users out
      } finally {
        setCheckingAccess(false);
      }
    };

    checkAccess();
  }, [user]);

  useEffect(() => {
    // Wait for the router to be ready
    if (!router) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onWaitlist = segments[0] === 'waitlist';

    // Use setTimeout to ensure navigation happens after mount
    const timeout = setTimeout(() => {
      if (!user && !inAuthGroup) {
        // Redirect to sign-in if not authenticated
        router.replace('/sign-in');
      } else if (user && inAuthGroup) {
        // Check access before redirecting to app
        if (checkingAccess) return; // Wait for access check

        if (hasAccess === false) {
          // User doesn't have access, redirect to waitlist
          router.replace('/waitlist');
        } else {
          // User has access, redirect to app
          router.replace('/(tabs)');
        }
      } else if (user && !onWaitlist && hasAccess === false) {
        // User is authenticated but doesn't have access
        router.replace('/waitlist');
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [user, segments, router, hasAccess, checkingAccess]);
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();

  useProtectedRoute(user);

  // Show nothing while loading or during authentication redirect
  if (loading) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="waitlist" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
