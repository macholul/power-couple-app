import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChip } from '@/components/back-chip';
import { CharacterStage } from '@/components/character-stage';
import { GoalsEditor } from '@/components/goals-editor';
import { HeartIcon } from '@/components/heart-icon';
import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { SendLove } from '@/components/send-love';
import { signOut } from '@/lib/actions/auth';
import { useCoupleData } from '@/lib/couple-data';
import { genderOf, possessive } from '@/lib/people';
import { computeStreaks } from '@/lib/streaks';
import { coupleThemes } from '@/lib/theme';
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
  const { tasks, completions, daySchedules, loading, refresh } = useCoupleData();

  const myGoals = tasks.filter(
    (task) => task.assigned_to === viewer.userId && !task.archived_at,
  );

  const { viewerTheme: theme, partnerTheme } = coupleThemes(viewer.profile, viewer.partner);

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
  const partnerPronoun = possessive(genderOf(viewer.partner));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
      // the goal inputs sit low on the page; keep the focused one above the keyboard
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.header}>
        <BackChip
          label="home"
          color={theme.deep}
          shadowColor={theme.shadowBadge}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Text style={styles.headerTitle} accessibilityRole="header">
          my profile
        </Text>
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
            {loading ? '–' : ownStreaks[0]}
          </Text>
          <Text style={styles.streakCaption}>my streak</Text>
        </View>
        <View style={[styles.streakCard, { borderColor: NEUTRAL.cardBorder }]}>
          <View style={styles.heartSlot}>
            <HeartIcon size={17} color="#E5628E" />
          </View>
          <Text style={[styles.streakNumber, { color: NEUTRAL.ink }]}>
            {loading ? '–' : coupleStreak}
          </Text>
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

      <View style={styles.footer}>
        <Press onPress={() => router.push('/account')} style={styles.footerLink}>
          <Text style={styles.footerLabel}>account settings</Text>
        </Press>
        <Press onPress={() => void signOut()} style={styles.footerLink}>
          <Text style={styles.footerLabel}>log out</Text>
        </Press>
      </View>
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
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8 },
  footerLink: { paddingVertical: 10, paddingHorizontal: 14 },
  footerLabel: { fontFamily: FONT.medium, fontSize: 13, color: NEUTRAL.muted },
});
