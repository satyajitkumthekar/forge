/**
 * Waitlist Screen - Shown to users who don't have access yet
 * Shows user's position in line and estimated wait info
 */

import React, { useState, useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { Box, VStack, Text, HStack } from '@gluestack-ui/themed';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import type { UserPositionInfo } from '@/types';

export default function WaitlistScreen() {
  const { user } = useAuth();
  const [positionInfo, setPositionInfo] = useState<UserPositionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWaitlistInfo = async () => {
      try {
        const info = await db.access.getUserPosition();
        setPositionInfo(info);
      } catch (err) {
        console.error('Error loading waitlist info:', err);
      } finally {
        setLoading(false);
      }
    };

    loadWaitlistInfo();
  }, []);

  if (loading) {
    return (
      <Box flex={1} bg="#000000" alignItems="center" justifyContent="center">
        <ActivityIndicator size="large" color="#fff" />
      </Box>
    );
  }

  return (
    <Box flex={1} bg="#000000" alignItems="center" justifyContent="center" p={16}>
      {/* Animated background elements */}
      <Box
        sx={{
          position: 'absolute',
          top: '25%',
          left: '25%',
          width: 384,
          height: 384,
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          borderRadius: 9999,
          opacity: 0.8,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '25%',
          right: '25%',
          width: 384,
          height: 384,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderRadius: 9999,
          opacity: 0.8,
        }}
      />

      {/* Main content */}
      <VStack
        sx={{ position: 'relative', zIndex: 10, maxWidth: 600, width: '100%' }}
        alignItems="center"
      >
        {/* Rocket emoji */}
        <Text fontSize={64} mb={32}>
          🚀
        </Text>

        {/* Main heading */}
        <Text fontSize={48} fontWeight="700" color="white" mb={24} textAlign="center">
          You're on the list!
        </Text>

        {/* User rank card */}
        <Box
          mb={32}
          borderRadius={24}
          overflow="hidden"
          sx={{
            shadowColor: 'black',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Box
            p={4}
            sx={{
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #3b82f6 100%)',
            }}
          >
            <Box bg="#000000" borderRadius={16} px={32} py={24} alignItems="center">
              <Text
                fontSize={14}
                fontWeight="600"
                color="#9CA3AF"
                mb={8}
                textTransform="uppercase"
                sx={{ letterSpacing: 0.5 }}
              >
                Your Position
              </Text>
              <Text
                fontSize={96}
                fontWeight="700"
                sx={{
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #3b82f6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                #{positionInfo?.rank}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Description */}
        <VStack space="lg" mb={32} alignItems="center">
          <Text fontSize={20} fontWeight="500" color="#D1D5DB" textAlign="center">
            We're letting people in gradually.
          </Text>
          <Text fontSize={18} color="#9CA3AF" textAlign="center">
            Currently allowing the first{' '}
            <Text fontWeight="600" color="white">
              {positionInfo?.maxAllowed}
            </Text>{' '}
            users.
          </Text>
          <Text fontSize={16} color="#6B7280" textAlign="center">
            You're secured in line and will get instant access when we expand capacity.
          </Text>
        </VStack>

        {/* Email display */}
        <Box
          bg="rgba(255, 255, 255, 0.05)"
          borderWidth={1}
          borderColor="rgba(255, 255, 255, 0.1)"
          borderRadius={16}
          p={24}
          mb={32}
          w="$full"
          sx={{
            backdropFilter: 'blur(8px)',
          }}
        >
          <Text fontSize={14} color="#9CA3AF" mb={8} textAlign="center">
            We'll notify you at
          </Text>
          <Text fontSize={18} color="white" fontWeight="500" textAlign="center">
            {user?.email}
          </Text>
        </Box>

        {/* Status indicator */}
        <HStack alignItems="center" space="sm">
          <Box w={8} h={8} bg="#10B981" borderRadius={9999} />
          <Text fontSize={14} color="#9CA3AF">
            Your spot is secured
          </Text>
        </HStack>

        {/* Additional info */}
        <Box mt={48} pt={32} borderTopWidth={1} borderTopColor="rgba(255, 255, 255, 0.1)">
          <Text fontSize={14} color="#6B7280" textAlign="center">
            Questions? Contact us at <Text color="#C084FC">support@foodtracker.com</Text>
          </Text>
        </Box>
      </VStack>
    </Box>
  );
}
