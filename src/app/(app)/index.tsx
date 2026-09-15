import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarFace } from '@/components/avatar-face';
import { CharacterStage } from '@/components/character-stage';
import { GoalCard, type GoalCardState } from '@/components/goal-card';
import { HeartIcon } from '@/components/heart-icon';
import { MonthGrid } from '@/components/month-grid';
import { NoteBubble } from '@/components/note-bubble';
import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { Wordmark } from '@/components/wordmark';
import { useCoupleData } from '@/lib/couple-data';
import { addDaysToKey, dateKeyIn, weekdayOfKey } from '@/lib/dates';
import { leftToRight } from '@/lib/people';
import { computeStreaks } from '@/lib/streaks';
import { otherCharacter, themeFor, type SideTheme } from '@/lib/theme';
import type {
  LoveNote,
  Profile,
  Task,
  TaskCompletion,
} from '@/lib/types/database';
import { useRequireViewer, type Viewer } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

interface TodayGoal {
  task: Task;
  state: GoalCardState;
  completionId: string | null;
  photoPath: string | null;
}

function todayGoalsFor(
  profile: Profile,
  tasks: Task[],
  completions: TaskCompletion[],
): TodayGoal[] {
  // "today" is this partner's local day, so the two panels can legitimately
  // show different calendar days when the couple is in different timezones
  const dateKey = dateKeyIn(profile.timezone);
  const weekday = weekdayOfKey(dateKey);

  const goals = tasks.filter(
    (task) =>
      task.assigned_to === profile.id &&
      !task.archived_at &&
      task.scheduled_weekdays.includes(weekday),
  );

  return goals.map((task) => {
    const completion = completions.find(
      (candidate) =>
        candidate.task_id === task.id && candidate.scheduled_date === dateKey,
    );
    const state: GoalCardState = !completion
      ? 'todo'
      : completion.status === 'approved'
        ? 'confirmed'
        : 'proof';
    return {
      task,
      state,
      completionId: completion?.id ?? null,
      // the web built a stable /photos/<id> URL so the browser could cache it;
      // here the raw storage path is the cache key and lib/photos signs it
      photoPath: completion?.photo_url ?? null,
    };
  });
}

export default function HomeScreen() {
  const viewer = useRequireViewer();

  // The gate guarantees a paired viewer before this screen mounts. Splitting
  // the screen in two keeps every hook below unconditional, which is what the
  // web got for free by awaiting requireViewer() before rendering at all.
  if (!viewer) return null;

  return <Home viewer={viewer} />;
}

function Home({ viewer }: { viewer: Viewer }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, completions, notes, daySchedules, loading, refresh } = useCoupleData();

  const viewerTheme = themeFor(viewer.profile.avatar_character);
  const partnerCharacter =
    viewer.partner.avatar_character === viewer.profile.avatar_character
      ? otherCharacter(viewerTheme.key)
      : viewer.partner.avatar_character;
  const partnerTheme = themeFor(partnerCharacter);

  // the woman's panel on the left, the man's on the right
  const sides = leftToRight(viewer.profile, viewer.partner).map((profile) => ({
    profile,
    theme: profile.id === viewer.userId ? viewerTheme : partnerTheme,
  }));

  const sideGoals = [
    todayGoalsFor(sides[0].profile, tasks, completions),
    todayGoalsFor(sides[1].profile, tasks, completions),
  ];

  const noteFor = (senderId: string): LoveNote | null =>
    notes.find((note) => note.sender_id === senderId) ?? null;

  // proofs the partner sent on THEIR yesterday that the viewer never confirmed
  // (easy to miss across timezones once the panel rolls over); confirming late
  // still credits the day it was done
  const partnerYesterday = addDaysToKey(dateKeyIn(viewer.partner.timezone), -1);
  const missedConfirmations = completions
    .filter(
      (completion) =>
        completion.status === 'submitted' &&
        completion.submitted_by === viewer.partnerId &&
        completion.scheduled_date === partnerYesterday,
    )
    .flatMap((completion) => {
      const task = tasks.find((candidate) => candidate.id === completion.task_id);
      return task ? [{ task, completion }] : [];
    });

  const { coupleStreak, monthDays } = computeStreaks(
    [
      { userId: viewer.userId, timezone: viewer.profile.timezone },
      { userId: viewer.partnerId, timezone: viewer.partner.timezone },
    ],
    tasks,
    completions,
    daySchedules,
  );

  const nameOf = (profile: Profile) => profile.display_name ?? 'your person';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.header}>
        <Wordmark size={26} />
        <Press
          onPress={() => router.push('/profile')}
          accessibilityLabel="Profile"
          style={styles.profileChip}
        >
          <AvatarFace src={viewerTheme.faceImg} background={viewerTheme.chip} />
          <Text style={styles.profileChipLabel}>profile</Text>
        </Press>
      </View>

      <View style={styles.panels}>
        {sides.map((side, index) => (
          <SidePanel
            key={side.profile.id}
            coupleId={viewer.couple.id}
            profile={side.profile}
            theme={side.theme}
            goals={sideGoals[index]}
            note={noteFor(side.profile.id)}
            viewerId={viewer.userId}
            reviewerName={nameOf(
              side.profile.id === viewer.userId ? viewer.partner : viewer.profile,
            )}
            loading={loading}
            delay={index * 0.08}
            onChanged={refresh}
          />
        ))}
      </View>

      {missedConfirmations.length > 0 && (
        <PopIn
          delay={0.12}
          style={[
            styles.missedCard,
            { backgroundColor: partnerTheme.panel, borderColor: partnerTheme.panelBorder },
          ]}
        >
          <Text style={[styles.missedTitle, { color: partnerTheme.deep }]}>
            missed confirmations
          </Text>
          <Text style={[styles.missedSubtitle, { color: partnerTheme.mutedText }]}>
            {nameOf(viewer.partner)} finished these yesterday — confirm so they count
          </Text>
          <View style={styles.missedStage}>
            <CharacterStage
              src={partnerTheme.madImg}
              height={150}
              gradient={partnerTheme.stageGradient}
            />
          </View>
          <View style={styles.missedGrid}>
            {missedConfirmations.map(({ task, completion }) => (
              <View key={completion.id} style={styles.missedCell}>
                <GoalCard
                  coupleId={viewer.couple.id}
                  taskId={task.id}
                  label={task.title}
                  state="proof"
                  photoPath={completion.photo_url}
                  completionId={completion.id}
                  isMine={false}
                  reviewerName={nameOf(viewer.profile)}
                  theme={partnerTheme}
                  onChanged={refresh}
                />
              </View>
            ))}
          </View>
        </PopIn>
      )}

      <PopIn delay={0.16} style={styles.streakCard}>
        <View
          style={styles.streakRow}
          accessible
          accessibilityLabel={loading ? 'Loading streak' : `${coupleStreak} day streak together`}
        >
          <View style={styles.streakBadge}>
            <HeartIcon size={26} color="#E5628E" />
          </View>
          <View>
            <View style={styles.streakNumberRow}>
              {/* no number until it is real: a 0 that becomes 12 reads as a lost streak */}
              <Text style={styles.streakNumber}>{loading ? '–' : coupleStreak}</Text>
              <Text style={styles.streakUnit}>day streak</Text>
            </View>
            <Text style={styles.streakCaption}>together, every single day</Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={NEUTRAL.muted} style={styles.gridLoading} />
        ) : (
          <MonthGrid levels={monthDays.map((day) => day.level)} />
        )}
      </PopIn>
    </ScrollView>
  );
}

function SidePanel({
  coupleId,
  profile,
  theme,
  goals,
  note,
  viewerId,
  reviewerName,
  loading,
  delay,
  onChanged,
}: {
  coupleId: string;
  profile: Profile;
  theme: SideTheme;
  goals: TodayGoal[];
  note: LoveNote | null;
  viewerId: string;
  reviewerName: string;
  loading: boolean;
  delay: number;
  onChanged: () => Promise<void>;
}) {
  return (
    <PopIn
      delay={delay}
      style={[
        styles.panel,
        { backgroundColor: theme.panel, borderColor: theme.panelBorder },
      ]}
    >
      <View style={styles.nameRow}>
        <View style={[styles.nameBadge, { shadowColor: theme.shadowBadge }]}>
          <Text style={[styles.nameLabel, { color: theme.deep }]}>
            {profile.display_name}
          </Text>
        </View>
      </View>
      <CharacterStage src={theme.cutePoseImg} height={180} gradient={theme.stageGradient}>
        {note && (
          <NoteBubble
            noteId={note.id}
            text={note.text}
            border={theme.panelBorder}
            color={theme.deep}
            shadow={theme.shadowBadge}
            onDismissed={() => void onChanged()}
          />
        )}
      </CharacterStage>
      {goals.map((goal) => (
        <GoalCard
          key={goal.task.id}
          coupleId={coupleId}
          taskId={goal.task.id}
          label={goal.task.title}
          state={goal.state}
          photoPath={goal.photoPath}
          completionId={goal.completionId}
          isMine={profile.id === viewerId}
          reviewerName={reviewerName}
          theme={theme}
          onChanged={onChanged}
        />
      ))}
      {loading ? (
        <ActivityIndicator color={theme.mutedText} style={styles.panelLoading} />
      ) : (
        goals.length === 0 && (
          <Text style={[styles.emptyLabel, { color: theme.mutedText }]}>
            nothing scheduled today
          </Text>
        )
      )}
    </PopIn>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEUTRAL.bg },
  // the web capped the column at 430px and centred it; on a phone the screen
  // is narrower than that, so this only matters on tablets and landscape
  content: { maxWidth: 430, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    shadowColor: 'rgba(229,98,142,0.15)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  profileChipLabel: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.secondary },
  panels: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 8 },
  panel: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 10,
  },
  nameRow: { alignItems: 'center' },
  nameBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  nameLabel: { fontFamily: FONT.semibold, fontSize: 15 },
  emptyLabel: {
    fontFamily: FONT.medium,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
  panelLoading: { paddingVertical: 8 },
  gridLoading: { marginTop: 16, marginBottom: 4 },
  missedCard: {
    marginTop: 14,
    marginHorizontal: 12,
    borderWidth: 2,
    borderRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  missedTitle: {
    fontFamily: FONT.semibold,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  missedSubtitle: {
    fontFamily: FONT.medium,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  missedStage: { marginBottom: 10 },
  missedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // two columns, matching the web's `repeat(2, 1fr)` with a 10px gap
  missedCell: { width: '48%' },
  streakCard: {
    marginTop: 14,
    marginHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  streakBadge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FFE3EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  streakNumber: { fontFamily: FONT.bold, fontSize: 34, color: '#E5628E' },
  streakUnit: { fontFamily: FONT.semibold, fontSize: 16, color: NEUTRAL.secondary },
  streakCaption: { fontFamily: FONT.medium, fontSize: 13, color: NEUTRAL.muted },
});
