import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import Head from 'expo-router/head';
import { Platform } from 'react-native';
import './global.css';

import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { db } from '@/lib/database';
import ToastHost from '@/components/ui/Toast';

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
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
    }
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function useProtectedRoute(user: any, authLoading: boolean) {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);

  // Check access when user changes
  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      if (!user) {
        setHasAccess(null);
        return;
      }

      setCheckingAccess(true);
      try {
        let access: boolean;
        try {
          access = await db.access.check();
        } catch {
          // One retry after a short backoff for transient failures
          await new Promise((resolve) => setTimeout(resolve, 1500));
          access = await db.access.check();
        }
        if (!cancelled) setHasAccess(access);
      } catch (err) {
        console.error('Error checking access:', err);
        // Fail closed: unknown access never grants entry to the app.
        // The user stays where they are until a check succeeds.
        if (!cancelled) setHasAccess(null);
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    // Never navigate while auth state is unknown: the layout renders null
    // (no navigator mounted) during loading, and navigating then crashes
    // with "Attempted to navigate before mounting the Root Layout"
    if (authLoading) return;

    // Wait until the root navigator is mounted before navigating
    if (!navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onWaitlist = segments[0] === 'waitlist';

    if (!user && !inAuthGroup) {
      // Redirect to sign-in if not authenticated
      router.replace('/sign-in');
    } else if (user && inAuthGroup) {
      // Only redirect on a definitive access answer (fail closed on null)
      if (checkingAccess || hasAccess === null) return;
      router.replace(hasAccess ? '/(tabs)' : '/waitlist');
    } else if (user && !onWaitlist && hasAccess === false) {
      // User is authenticated but doesn't have access
      router.replace('/waitlist');
    }
  }, [user, authLoading, segments, router, navigationState?.key, hasAccess, checkingAccess]);
}

function RootLayoutNav() {
  const { user, loading } = useAuth();

  useProtectedRoute(user, loading);

  // Show nothing while loading or during authentication redirect
  if (loading) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="waitlist" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
      <ToastHost />
    </ThemeProvider>
  );
}
