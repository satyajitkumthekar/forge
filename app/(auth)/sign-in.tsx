/**
 * Sign In Screen
 * ABSTRACTION: Uses AuthContext, not Supabase directly
 */

import React, { useState, useRef, useEffect } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { friendlyAuthError } from '@/lib/auth-errors';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  InputField,
  Button,
  ButtonText,
  Spinner,
  Pressable,
} from '@gluestack-ui/themed';
import { colors, spacing, maxWidth } from '@/lib/design-tokens';

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

  const handleSignIn = async () => {
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <Box
        flex={1}
        justifyContent="center"
        px={{ base: spacing.lg, md: spacing['2xl'] }}
        bg={colors.background}
        sx={{
          maxWidth: maxWidth.form,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {/* Logo/Title */}
        <VStack alignItems="center" mb="$8">
          <Box
            w="$16"
            h="$16"
            bg="$black"
            borderRadius="$2xl"
            alignItems="center"
            justifyContent="center"
            mb="$4"
          >
            <Text color="$white" fontSize="$2xl" fontWeight="$bold">
              FT
            </Text>
          </Box>
          <Text fontSize="$3xl" fontWeight="$bold" color="$textLight900">
            Food Tracker
          </Text>
          <Text color="$textLight500" mt="$2">
            Track your nutrition with AI
          </Text>
        </VStack>

        {/* Form */}
        <VStack space="md">
          <Box>
            <Text fontSize="$sm" fontWeight="$medium" color="$textLight700" mb="$2">
              Email
            </Text>
            <Input size="md" variant="outline">
              <InputField
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </Input>
          </Box>

          <Box>
            <Text fontSize="$sm" fontWeight="$medium" color="$textLight700" mb="$2">
              Password
            </Text>
            <Input size="md" variant="outline">
              <InputField
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                type="password"
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
              />
            </Input>
          </Box>

          {error ? (
            <Box
              bg="$red50"
              borderColor="$red200"
              borderWidth="$1"
              borderRadius="$lg"
              p="$3"
            >
              <Text color="$red800" fontSize="$sm">
                {error}
              </Text>
            </Box>
          ) : null}

          <Button
            size="lg"
            onPress={handleSignIn}
            isDisabled={loading}
            bg="$black"
            borderRadius="$lg"
            $active-opacity={0.8}
          >
            {loading ? (
              <Spinner color="$white" />
            ) : (
              <ButtonText fontWeight="$semibold">Sign In</ButtonText>
            )}
          </Button>

          <HStack justifyContent="center" alignItems="center" mt="$4">
            <Text color="$textLight600">Don't have an account? </Text>
            <Link href="/sign-up" asChild>
              <Pressable>
                <Text color="$black" fontWeight="$semibold">
                  Sign Up
                </Text>
              </Pressable>
            </Link>
          </HStack>
        </VStack>
      </Box>
    </KeyboardAvoidingView>
  );
}
