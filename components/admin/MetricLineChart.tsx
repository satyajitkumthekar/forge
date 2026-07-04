/**
 * MetricLineChart - 30-day metric line chart in a card.
 * Display-only: receives pre-mapped {value,label} data from the parent.
 */

import React from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { tokens } from '@/lib/design-tokens';

interface MetricLineChartProps {
  title: string;
  data: { value: number; label: string }[];
  width: number;
}

export default function MetricLineChart({ title, data, width }: MetricLineChartProps) {
  return (
    <div className="bg-paper-raised rounded-card border border-line p-6 shadow-card">
      <h3 className="text-sm font-semibold tracking-tight text-ink mb-4">{title}</h3>
      <View style={{ alignItems: 'center' }}>
        <LineChart
          data={data}
          width={width}
          height={200}
          color={tokens.colors.ink.DEFAULT}
          thickness={1.5}
          startFillColor="rgba(31,28,24,0.07)"
          endFillColor="rgba(31,28,24,0)"
          startOpacity={1}
          endOpacity={0}
          spacing={30}
          noOfSections={5}
          yAxisColor={tokens.colors.line.DEFAULT}
          xAxisColor={tokens.colors.line.DEFAULT}
          yAxisTextStyle={{ color: tokens.colors.ink.faint, fontSize: 11 }}
          xAxisLabelTextStyle={{ color: tokens.colors.ink.faint, fontSize: 10, width: 70, textAlign: 'center' }}
          hideRules
          isAnimated
          animationDuration={300}
        />
      </View>
    </div>
  );
}
