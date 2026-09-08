import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Press } from '@/components/press';
import { addGoal, archiveGoal, renameGoal, setGoalWeekdays } from '@/lib/actions/goals';
import type { SideTheme } from '@/lib/theme';
import type { Task } from '@/lib/types/database';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Port of components/GoalsEditor.tsx. */
const DAY_LETTERS = ['s', 'm', 't', 'w', 't', 'f', 's'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function WeekdayPills({
  selected,
  onToggle,
  theme,
}: {
  selected: number[];
  onToggle: (day: number) => void;
  theme: SideTheme;
}) {
  return (
    <View style={styles.pillRow}>
      {DAY_LETTERS.map((letter, day) => {
        const active = selected.includes(day);
        return (
          <Press
            key={day}
            onPress={() => onToggle(day)}
            style={[
              styles.pill,
              {
                backgroundColor: active ? theme.accent : theme.chip,
                opacity: active ? 1 : 0.55,
              },
            ]}
          >
            <Text
              style={[styles.pillLetter, { color: active ? '#FFFFFF' : theme.deep }]}
            >
              {letter}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

function GoalRow({
  goal,
  theme,
  onDelete,
  onChanged,
}: {
  goal: Task;
  theme: SideTheme;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [days, setDays] = useState(goal.scheduled_weekdays);
  const [title, setTitle] = useState(goal.title);
  const isTemp = goal.id.startsWith('temp-');

  const toggleDay = (day: number) => {
    if (isTemp) return; // still being created
    const next = days.includes(day)
      ? days.filter((existing) => existing !== day)
      : [...days, day].sort((a, b) => a - b);
    if (next.length === 0) return; // a goal needs at least one day
    setDays(next);
    void setGoalWeekdays(goal.id, next).then(onChanged);
  };

  const commitTitle = () => {
    if (isTemp) return;
    const value = title.trim();
    if (!value) {
      setTitle(goal.title); // the web's empty-title guard, made visible
      return;
    }
    if (value !== goal.title) void renameGoal(goal.id, value).then(onChanged);
  };

  return (
    <View style={[styles.row, { backgroundColor: theme.tintBg }]}>
      <View style={styles.rowTop}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={commitTitle}
          onSubmitEditing={commitTitle}
          editable={!isTemp}
          returnKeyType="done"
          style={styles.titleInput}
        />
        <Press
          onPress={onDelete}
          feel="hard"
          accessibilityLabel="Delete goal"
          style={[styles.deleteButton, { backgroundColor: theme.chip }]}
        >
          <View style={[styles.deleteStroke, { backgroundColor: theme.deep }]} />
          <View
            style={[
              styles.deleteStroke,
              styles.deleteStrokeBack,
              { backgroundColor: theme.deep },
            ]}
          />
        </Press>
      </View>
      <WeekdayPills selected={days} onToggle={toggleDay} theme={theme} />
    </View>
  );
}

export function GoalsEditor({
  goals,
  theme,
  onChanged,
}: {
  goals: Task[];
  theme: SideTheme;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // optimistic edits the web got from useOptimistic; cleared by the refresh
  const [pendingAdds, setPendingAdds] = useState<Task[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const visible = [...goals, ...pendingAdds].filter(
    (goal) => !deletedIds.includes(goal.id),
  );

  const toggleNewDay = (day: number) => {
    setNewDays((current) => {
      const next = current.includes(day)
        ? current.filter((existing) => existing !== day)
        : [...current, day].sort((a, b) => a - b);
      return next.length === 0 ? current : next;
    });
  };

  const onAdd = async () => {
    const title = draft.trim();
    if (!title || adding) return;
    const days = newDays;
    setDraft('');
    setNewDays(ALL_DAYS);
    setError(null);
    setAdding(true);

    const temp: Task = {
      id: `temp-${Date.now()}`,
      couple_id: '',
      assigned_to: '',
      title,
      scheduled_weekdays: days,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setPendingAdds((current) => [...current, temp]);

    const result = await addGoal(title, days);
    setAdding(false);
    if (result.error) setError(result.error);
    setPendingAdds((current) => current.filter((goal) => goal.id !== temp.id));
    onChanged();
  };

  const onDelete = async (id: string) => {
    setDeletedIds((current) => [...current, id]);
    const result = await archiveGoal(id);
    if (result.error) {
      setError(result.error);
      setDeletedIds((current) => current.filter((existing) => existing !== id));
    }
    onChanged();
  };

  return (
    <View style={styles.editor}>
      {visible.map((goal) => (
        <GoalRow
          key={goal.id}
          goal={goal}
          theme={theme}
          onDelete={() => void onDelete(goal.id)}
          onChanged={onChanged}
        />
      ))}
      <View style={styles.addBlock}>
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void onAdd()}
            placeholder="add a new goal"
            placeholderTextColor={NEUTRAL.placeholder}
            returnKeyType="done"
            style={[styles.addInput, { borderColor: theme.dashedBorder }]}
          />
          <Press
            onPress={() => void onAdd()}
            disabled={adding}
            style={[
              styles.addButton,
              { backgroundColor: theme.accent, opacity: adding ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.addButtonLabel}>add</Text>
          </Press>
        </View>
        <WeekdayPills selected={newDays} onToggle={toggleNewDay} theme={theme} />
        {error && <Text style={[styles.error, { color: theme.deep }]}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 8 },
  row: { gap: 6, borderRadius: 14, paddingTop: 6, paddingRight: 6, paddingBottom: 8, paddingLeft: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleInput: {
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 14,
    color: NEUTRAL.ink,
    padding: 0,
    // explicit, not cosmetic: iOS recycles native text inputs between screens
    // and an unset letterSpacing keeps the previous tenant's value
    letterSpacing: 0,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // the web drew the X as two rotated 12x2.5 bars; same here
  deleteStroke: {
    position: 'absolute',
    width: 12,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  deleteStrokeBack: { transform: [{ rotate: '-45deg' }] },
  pillRow: { flexDirection: 'row', gap: 4 },
  pill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLetter: { fontFamily: FONT.semibold, fontSize: 11 },
  addBlock: { gap: 6, marginTop: 2 },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontFamily: FONT.regular,
    fontSize: 14,
    color: NEUTRAL.ink,
    backgroundColor: NEUTRAL.inputBg,
    letterSpacing: 0,
  },
  addButton: {
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#FFFFFF' },
  error: { fontFamily: FONT.medium, fontSize: 12 },
});
