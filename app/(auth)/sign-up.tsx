/**
 * Sign Up Screen
 * ABSTRACTION: Uses AuthContext, not Supabase directly
 */

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
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

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      setError(signUpError.message || 'Failed to sign up');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Box
        flex={1}
        bg={colors.background}
        justifyContent="center"
        px={{ base: spacing.lg, md: spacing['2xl'] }}
        sx={{
          maxWidth: maxWidth.form,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Box bg="$white" borderRadius="$2xl" p="$6" borderWidth="$1" borderColor="$borderLight200">
          <VStack alignItems="center" mb="$4">
            <Box
              w="$16"
              h="$16"
              bg="$green100"
              borderRadius="$full"
              alignItems="center"
              justifyContent="center"
              mb="$4"
            >
              <Text fontSize="$4xl">✓</Text>
            </Box>
            <Text fontSize="$2xl" fontWeight="$bold" color="$textLight900" mb="$2">
              Check Your Email
            </Text>
            <Text color="$textLight600" textAlign="center">
              We've sent you a confirmation link. Please check your email to verify your account.
            </Text>
          </VStack>

          <Link href="/sign-in" asChild>
            <Button size="lg" bg="$black" borderRadius="$lg" mt="$4">
              <ButtonText fontWeight="$semibold">Back to Sign In</ButtonText>
            </Button>
          </Link>
        </Box>
      </Box>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xl,
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
            Create Account
          </Text>
          <Text color="$textLight500" mt="$2">
            Start tracking your nutrition
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
              />
            </Input>
          </Box>

          <Box>
            <Text fontSize="$sm" fontWeight="$medium" color="$textLight700" mb="$2">
              Confirm Password
            </Text>
            <Input size="md" variant="outline">
              <InputField
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                type="password"
              />
            </Input>
          </Box>

          {error ? (
            <Box bg="$red50" borderColor="$red200" borderWidth="$1" borderRadius="$lg" p="$3">
              <Text color="$red800" fontSize="$sm">
                {error}
              </Text>
            </Box>
          ) : null}

          <Button
            size="lg"
            onPress={handleSignUp}
            isDisabled={loading}
            bg="$black"
            borderRadius="$lg"
            $active-opacity={0.8}
          >
            {loading ? (
              <Spinner color="$white" />
            ) : (
              <ButtonText fontWeight="$semibold">Sign Up</ButtonText>
            )}
          </Button>

          <HStack justifyContent="center" alignItems="center" mt="$4">
            <Text color="$textLight600">Already have an account? </Text>
            <Link href="/sign-in" asChild>
              <Pressable>
                <Text color="$black" fontWeight="$semibold">
                  Sign In
                </Text>
              </Pressable>
            </Link>
          </HStack>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
