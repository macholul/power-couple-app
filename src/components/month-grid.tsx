import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DayLevel } from '@/lib/streaks';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Port of components/MonthGrid.tsx. */
const LEVEL_COLORS: Record<DayLevel, string> = {
  0: '#F3E7DC',
  1: '#F7B7CD',
  2: '#E5628E',
  3: '#FAF3EB', // free day / today in progress
};

const LEGEND: { level: DayLevel; label: string }[] = [
  { level: 2, label: 'both done' },
  { level: 1, label: 'one done' },
  { level: 0, label: 'missed' },
];

const COLUMNS = 7;
const GAP = 6;

export function MonthGrid({ levels }: { levels: DayLevel[] }) {
  const [width, setWidth] = useState(0);

  // The web said `grid-template-columns: repeat(7, 1fr)` with `aspect-ratio: 1`.
  // React Native's flexbox has no grid and percentage widths do not know about
  // `gap`, so the row measures itself and the cell size is solved directly:
  // seven cells plus six gaps must fill the row exactly.
  const cell = width > 0 ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.heading}>this month</Text>
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {cell > 0 &&
          levels.map((level, index) => (
            <View
              key={index}
              style={{
                width: cell,
                height: cell,
                borderRadius: 7,
                backgroundColor: LEVEL_COLORS[level],
              }}
            />
          ))}
      </View>
      <View style={styles.legend}>
        {LEGEND.map(({ level, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[level] }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 14, gap: 8 },
  heading: { fontFamily: FONT.semibold, fontSize: 13, color: NEUTRAL.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, minHeight: 20 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 4 },
  legendLabel: { fontFamily: FONT.medium, fontSize: 11, color: NEUTRAL.muted },
});
