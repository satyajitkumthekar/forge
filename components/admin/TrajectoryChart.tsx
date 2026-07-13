/**
 * TrajectoryChart - weekly miss counts, one line per fork bucket.
 * The arc that matters: the two friction lines (out of control, knowledge
 * gap) shrink as the coach's clearing lands; could-but-didn't rises into
 * view, then shrinks as the internal work lands.
 */

import React from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { tokens } from '@/lib/design-tokens';

type SeriesPoint = { value: number; label: string };

interface TrajectoryChartProps {
  outControl: SeriesPoint[];
  knowledge: SeriesPoint[];
  wouldnt: SeriesPoint[];
  width: number;
}

const LEGEND = [
  { label: 'Out of control', color: tokens.colors.warn.DEFAULT },
  { label: 'Knowledge gap', color: tokens.colors.alert.DEFAULT },
  { label: "Could but didn't", color: tokens.colors.danger.DEFAULT },
];

export default function TrajectoryChart({ outControl, knowledge, wouldnt, width }: TrajectoryChartProps) {
  const maxValue =
    Math.max(
      3,
      ...outControl.map((p) => p.value),
      ...knowledge.map((p) => p.value),
      ...wouldnt.map((p) => p.value)
    ) + 1;

  return (
    <div>
      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-3">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <View style={{ alignItems: 'center' }}>
        <LineChart
          data={outControl}
          data2={knowledge}
          data3={wouldnt}
          width={width}
          height={180}
          maxValue={maxValue}
          color1={tokens.colors.warn.DEFAULT}
          color2={tokens.colors.alert.DEFAULT}
          color3={tokens.colors.danger.DEFAULT}
          dataPointsColor1={tokens.colors.warn.DEFAULT}
          dataPointsColor2={tokens.colors.alert.DEFAULT}
          dataPointsColor3={tokens.colors.danger.DEFAULT}
          thickness={2}
          spacing={Math.max(48, Math.floor(width / Math.max(2, outControl.length)))}
          noOfSections={Math.min(5, maxValue)}
          yAxisColor={tokens.colors.line.DEFAULT}
          xAxisColor={tokens.colors.line.DEFAULT}
          yAxisTextStyle={{ color: tokens.colors.ink.faint, fontSize: 11 }}
          xAxisLabelTextStyle={{ color: tokens.colors.ink.faint, fontSize: 10 }}
          hideRules
          isAnimated
          animationDuration={300}
        />
      </View>
    </div>
  );
}
