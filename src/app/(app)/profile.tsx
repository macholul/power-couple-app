import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CharacterStage } from '@/components/character-stage';
import { GoalsEditor } from '@/components/goals-editor';
import { HeartIcon } from '@/components/heart-icon';
import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { SendLove } from '@/components/send-love';
import { signOut } from '@/lib/actions/auth';
import { useCoupleData } from '@/lib/couple-data';
import { computeStreaks } from '@/lib/streaks';
import { otherCharacter, themeFor } from '@/lib/theme';
import { useRequireViewer, type Viewer } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

export default function ProfileScreen() {
  const viewer = useRequireViewer();
  if (!viewer) return null;
  return <Profile viewer={viewer} />;
}

function Profile({ viewer }: { viewer: Viewer }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, completions, daySchedules, refresh } = useCoupleData();

  const myGoals = tasks.filter(
    (task) => task.assigned_to === viewer.userId && !task.archived_at,
  );

  const theme = themeFor(viewer.profile.avatar_character);
  const partnerCharacter =
    viewer.partner.avatar_character === viewer.profile.avatar_character
      ? otherCharacter(theme.key)
      : viewer.partner.avatar_character;
  const partnerTheme = themeFor(partnerCharacter);

  const { coupleStreak, ownStreaks } = computeStreaks(
    [
      { userId: viewer.userId, timezone: viewer.profile.timezone },
      { userId: viewer.partnerId, timezone: viewer.partner.timezone },
    ],
    tasks,
    completions,
    daySchedules,
  );

  const partnerName = viewer.partner.display_name ?? 'your person';
  const partnerPronoun = partnerTheme.key === 'baris' ? 'his' : 'her';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Press
          onPress={() => router.back()}
          accessibilityLabel="Back to home"
          style={[styles.backChip, { shadowColor: theme.shadowBadge }]}
        >
          <View style={[styles.backArrow, { borderColor: theme.deep }]} />
          <Text style={[styles.backLabel, { color: theme.deep }]}>home</Text>
        </Press>
        <Text style={styles.headerTitle}>my profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <PopIn
        style={[
          styles.heroCard,
          { backgroundColor: theme.panel, borderColor: theme.panelBorder },
        ]}
      >
        <View style={styles.nameRow}>
          <View style={[styles.nameBadge, { shadowColor: theme.shadowBadge }]}>
            <Text style={[styles.nameLabel, { color: theme.deep }]}>
              {viewer.profile.display_name}
            </Text>
          </View>
        </View>
        <CharacterStage
          src={theme.waveImg}
          height={210}
          gradient={theme.profileStageGradient}
        />
      </PopIn>

      <PopIn delay={0.08} style={styles.streakRow}>
        <View style={[styles.streakCard, { borderColor: theme.panelBorder }]}>
          <View style={[styles.diamond, { backgroundColor: theme.accent }]} />
          <Text style={[styles.streakNumber, { color: theme.accent }]}>
            {ownStreaks[0]}
          </Text>
          <Text style={styles.streakCaption}>my streak</Text>
        </View>
        <View style={[styles.streakCard, { borderColor: NEUTRAL.cardBorder }]}>
          <View style={styles.heartSlot}>
            <HeartIcon size={17} color="#E5628E" />
          </View>
          <Text style={[styles.streakNumber, { color: NEUTRAL.ink }]}>{coupleStreak}</Text>
          <Text style={styles.streakCaption}>couple streak</Text>
        </View>
      </PopIn>

      <PopIn
        delay={0.16}
        style={[styles.goalsCard, { borderColor: theme.panelBorder }]}
      >
        <Text style={[styles.goalsTitle, { color: theme.deep }]}>my goals</Text>
        <GoalsEditor goals={myGoals} theme={theme} onChanged={refresh} />
      </PopIn>

      <SendLove
        partnerName={partnerName}
        partnerPronoun={partnerPronoun}
        theme={partnerTheme}
        onSent={refresh}
      />

      <Press onPress={() => void signOut()} style={styles.logout}>
        <Text style={styles.logoutLabel}>log out</Text>
      </Press>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEUTRAL.bg },
  content: {
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  // the web's chevron: a square with two borders, rotated 45deg
  backArrow: {
    width: 8,
    height: 8,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  backLabel: { fontFamily: FONT.semibold, fontSize: 14 },
  headerTitle: { fontFamily: FONT.semibold, fontSize: 20, color: NEUTRAL.ink },
  headerSpacer: { width: 74 },
  heroCard: {
    borderWidth: 2,
    borderRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  nameRow: { alignItems: 'center', marginBottom: 12 },
  nameBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  nameLabel: { fontFamily: FONT.semibold, fontSize: 16 },
  streakRow: { flexDirection: 'row', gap: 10 },
  streakCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 22,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  diamond: { width: 16, height: 16, borderRadius: 4, transform: [{ rotate: '45deg' }], marginTop: 4 },
  heartSlot: { marginTop: 4 },
  streakNumber: { fontFamily: FONT.bold, fontSize: 28 },
  streakCaption: { fontFamily: FONT.semibold, fontSize: 12, color: NEUTRAL.muted },
  goalsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 24,
    padding: 16,
  },
  goalsTitle: { fontFamily: FONT.semibold, fontSize: 16, marginBottom: 10 },
  logout: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginTop: 8 },
  logoutLabel: { fontFamily: FONT.medium, fontSize: 13, color: NEUTRAL.muted },
});
