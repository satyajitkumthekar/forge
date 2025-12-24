/**
 * WeeklyChart Component - Weekly Nutrition Charts
 * Uses react-native-gifted-charts for Expo compatibility
 */

import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import type { DayData } from '@/types';

interface WeeklyChartProps {
  dailyData: DayData[];
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories: number;
}

export default function WeeklyChart({ dailyData, targetCalories, targetProtein, maintenanceCalories }: WeeklyChartProps) {
  if (!dailyData || dailyData.length === 0) {
    return null;
  }

  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.min(windowWidth - 48, 800); // Account for padding

  // Helper to get day name from date string
  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Prepare calories data with asymmetric color coding
  const caloriesData = dailyData.map(day => {
    if (day.calories === 0) {
      return {
        value: day.calories,
        label: getDayName(day.date),
        frontColor: '#E5E7EB',
        topLabelComponent: () => (
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>
            {day.calories > 0 ? day.calories : ''}
          </Text>
        ),
      };
    }

    const isDeficit = targetCalories < maintenanceCalories;  // Cutting
    const isSurplus = targetCalories > maintenanceCalories;  // Bulking

    const diff = day.calories - targetCalories;
    const percentDiff = (diff / targetCalories) * 100;  // Positive = above, negative = below

    // Determine if we're on the "aligned" side (good direction)
    const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

    let barColor = '#4ADE80'; // green
    const absDiff = Math.abs(percentDiff);

    if (isAligned) {
      // ALIGNED SIDE (good direction) - Gradual thresholds
      if (absDiff <= 10) {
        barColor = '#4ADE80';  // green - 0-10%
      } else if (absDiff <= 20) {
        barColor = '#FBBF24';  // yellow - 10-20%
      } else if (absDiff <= 30) {
        barColor = '#FB923C';  // orange - 20-30%
      } else {
        barColor = '#F87171';  // red - >30%
      }
    } else {
      // NON-ALIGNED SIDE (bad direction) - Strict threshold
      if (absDiff <= 5) {
        barColor = '#4ADE80';  // green - 0-5% tolerance
      } else {
        barColor = '#F87171';  // red - >5%
      }
    }

    return {
      value: day.calories,
      label: getDayName(day.date),
      frontColor: barColor,
      topLabelComponent: () => (
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>
          {day.calories > 0 ? day.calories : ''}
        </Text>
      ),
    };
  });

  // Prepare protein data with color coding
  const proteinData = dailyData.map(day => {
    if (day.protein === 0) {
      return {
        value: day.protein,
        label: getDayName(day.date),
        frontColor: '#E5E7EB',
        topLabelComponent: () => (
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>
            {day.protein > 0 ? `${Math.round(day.protein * 10) / 10}g` : ''}
          </Text>
        ),
      };
    }

    // Calculate percentage below target
    const percentBelow = ((targetProtein - day.protein) / targetProtein) * 100;

    let barColor = '#4ADE80'; // green
    // Green: at or above target, or 0-10% below
    if (percentBelow <= 10) {
      barColor = '#4ADE80';  // green - 0-10% below
    } else if (percentBelow <= 20) {
      barColor = '#FBBF24';  // yellow - 10-20% below
    } else if (percentBelow <= 30) {
      barColor = '#FB923C';  // orange - 20-30% below
    } else {
      barColor = '#F87171';  // red - >30% below
    }

    return {
      value: day.protein,
      label: getDayName(day.date),
      frontColor: barColor,
      topLabelComponent: () => (
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>
          {day.protein > 0 ? `${Math.round(day.protein * 10) / 10}g` : ''}
        </Text>
      ),
    };
  });

  return (
    <View style={{ gap: 16 }}>
      {/* Calories Chart */}
      <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 16 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>
            Daily Calories
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              Target: <Text style={{ fontWeight: '600', color: '#111827' }}>{targetCalories}</Text>
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>•</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              Maintenance: <Text style={{ fontWeight: '600', color: '#111827' }}>{maintenanceCalories}</Text>
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center' }}>
          <BarChart
            data={caloriesData}
            width={chartWidth - 32}
            height={300}
            barWidth={Math.min((chartWidth - 100) / 7, 60)}
            spacing={Math.max((chartWidth - 100) / 14, 20)}
            roundedTop
            roundedBottom={false}
            noOfSections={5}
            yAxisThickness={1}
            xAxisThickness={1}
            yAxisColor="#E5E7EB"
            xAxisColor="#E5E7EB"
            yAxisTextStyle={{ color: '#6B7280', fontSize: 12 }}
            xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 12 }}
            hideRules
            showGradient={false}
            isAnimated
            animationDuration={300}
          />
        </View>

        {/* Legend */}
        <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, backgroundColor: '#4ADE80', borderRadius: 2 }} />
            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>On Track</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, backgroundColor: '#FBBF24', borderRadius: 2 }} />
            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Close</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, backgroundColor: '#FB923C', borderRadius: 2 }} />
            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Needs Work</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, backgroundColor: '#F87171', borderRadius: 2 }} />
            <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Off Track</Text>
          </View>
        </View>
      </View>

      {/* Protein Chart */}
      {targetProtein > 0 && (
        <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 16 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 6 }}>
              Daily Protein
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              Target: <Text style={{ fontWeight: '600', color: '#111827' }}>{targetProtein}g</Text>
            </Text>
          </View>

          <View style={{ alignItems: 'center' }}>
            <BarChart
              data={proteinData}
              width={chartWidth - 32}
              height={300}
              barWidth={Math.min((chartWidth - 100) / 7, 60)}
              spacing={Math.max((chartWidth - 100) / 14, 20)}
              roundedTop
              roundedBottom={false}
              noOfSections={5}
              yAxisThickness={1}
              xAxisThickness={1}
              yAxisColor="#E5E7EB"
              xAxisColor="#E5E7EB"
              yAxisTextStyle={{ color: '#6B7280', fontSize: 12 }}
              xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 12 }}
              hideRules
              showGradient={false}
              isAnimated
              animationDuration={300}
            />
          </View>

          {/* Legend */}
          <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: '#4ADE80', borderRadius: 2 }} />
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>On Track</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: '#FBBF24', borderRadius: 2 }} />
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Close</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: '#FB923C', borderRadius: 2 }} />
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Needs Work</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: '#F87171', borderRadius: 2 }} />
              <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}>Off Track</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
