import { useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChip } from '@/components/back-chip';
import { Gate } from '@/components/gate';
import { GenderChoice } from '@/components/gender-choice';
import { Press } from '@/components/press';
import { OPERATOR } from '@/content/legal';
import { deleteAccount, endCouple, rename, setGender } from '@/lib/actions/account';
import {
  changePassword,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  signOut,
} from '@/lib/actions/auth';
import { genderOf } from '@/lib/people';
import type { Gender, Profile } from '@/lib/types/database';
import { useRefreshViewer, useViewer } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * Account settings, for anyone signed in, paired or not: App Review requires
 * account deletion to be reachable in the app, and an unpaired person never
 * sees the profile screen.
 */
export default function AccountScreen() {
  return (
    <Gate area="account">
      <Account />
    </Gate>
  );
}

type Status = { error: string | null; done?: string };

function Account() {
  const state = useViewer();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (state.status !== 'paired' && state.status !== 'unpaired') return null;

  const userId = state.status === 'paired' ? state.viewer.userId : state.userId;
  const profile = state.status === 'paired' ? state.viewer.profile : state.profile;
  const partner = state.status === 'paired' ? state.viewer.partner : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.header}>
        <BackChip
          label="back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Text style={styles.headerTitle} accessibilityRole="header">
          account
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {profile && <YouCard key={profile.id} userId={userId} profile={profile} paired={!!partner} />}
      {partner && <CoupleCard partnerName={partner.display_name ?? 'your partner'} />}
      <PasswordCard />
      <AboutCard />

      <Press onPress={() => void signOut()} style={styles.quiet}>
        <Text style={styles.quietLabel}>log out</Text>
      </Press>
      <DeleteAccount />
    </ScrollView>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.error) return <Text style={styles.error}>{status.error}</Text>;
  if (status.done) return <Text style={styles.done}>{status.done}</Text>;
  return null;
}

function YouCard({ userId, profile, paired }: { userId: string; profile: Profile; paired: boolean }) {
  const refreshViewer = useRefreshViewer();
  const [name, setName] = useState(profile.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ error: null });
  const gender = genderOf(profile);

  const trimmed = name.trim();
  const changed = trimmed.length > 0 && trimmed !== (profile.display_name ?? '');

  const saveName = async () => {
    if (!changed || saving) return;
    setSaving(true);
    const result = await rename(userId, name);
    if (!result.error) await refreshViewer();
    setSaving(false);
    setStatus(result.error ? { error: result.error } : { error: null, done: 'name saved' });
  };

  const chooseGender = async (next: Gender) => {
    if (paired || next === gender || saving) return;
    setSaving(true);
    const result = await setGender(userId, next);
    if (!result.error) await refreshViewer();
    setSaving(false);
    setStatus({ error: result.error });
  };

  return (
    <Card title="you">
      <Text style={styles.label}>name</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputGrow]}
          value={name}
          onChangeText={(next) => {
            setName(next);
            setStatus({ error: null });
          }}
          maxLength={MAX_NAME_LENGTH}
          placeholder="your name"
          placeholderTextColor={NEUTRAL.placeholder}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void saveName()}
          accessibilityLabel="Name"
        />
        <Press
          onPress={() => void saveName()}
          disabled={!changed || saving}
          style={[styles.smallButton, (!changed || saving) && styles.dimmed]}
        >
          <Text style={styles.smallButtonLabel}>save</Text>
        </Press>
      </View>

      <Text style={styles.label}>i am a</Text>
      <GenderChoice value={gender} onChange={(next) => void chooseGender(next)} disabled={paired || saving} />
      {paired && (
        <Text style={styles.hint}>you can change this while you&apos;re not in a couple</Text>
      )}
      <StatusLine status={status} />
    </Card>
  );
}

function CoupleCard({ partnerName }: { partnerName: string }) {
  const router = useRouter();
  const refreshViewer = useRefreshViewer();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = async () => {
    setPending(true);
    setError(null);
    const result = await endCouple();
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    await refreshViewer();
    // Back to the home stack, whose gate now sends an unpaired person to the
    // pairing screen. Nothing underneath: open from pairing, replace instead.
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/pairing');
  };

  const confirm = () =>
    Alert.alert(
      `end your couple with ${partnerName}?`,
      'you’ll both be unpaired right away. nothing is deleted: your goals, photos and notes come back if you two pair again.',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'end couple', style: 'destructive', onPress: () => void end() },
      ],
    );

  return (
    <Card title="couple">
      <Text style={styles.body}>you&apos;re paired with {partnerName}</Text>
      <Press
        onPress={confirm}
        disabled={pending}
        style={[styles.outlineDanger, pending && styles.dimmed]}
      >
        <Text style={styles.outlineDangerLabel}>{pending ? 'ending...' : 'end couple'}</Text>
      </Press>
      {error && <Text style={styles.error}>{error}</Text>}
    </Card>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>({ error: null });

  const save = async () => {
    if (pending) return;
    setPending(true);
    const result = await changePassword(password);
    setPending(false);
    if (!result.error) setPassword('');
    setStatus(result.error ? { error: result.error } : { error: null, done: 'password changed' });
  };

  return (
    <Card title="password">
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputGrow]}
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setStatus({ error: null });
          }}
          placeholder={`new password (${MIN_PASSWORD_LENGTH}+ characters)`}
          placeholderTextColor={NEUTRAL.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          accessibilityLabel="New password"
        />
        <Press
          onPress={() => void save()}
          disabled={password.length === 0 || pending}
          style={[styles.smallButton, (password.length === 0 || pending) && styles.dimmed]}
        >
          <Text style={styles.smallButtonLabel}>save</Text>
        </Press>
      </View>
      <StatusLine status={status} />
    </Card>
  );
}

function AboutCard() {
  const router = useRouter();

  const contact = async () => {
    const url = `mailto:${OPERATOR.email}`;
    try {
      await Linking.openURL(url);
    } catch {
      // no mail app set up: show the address so it can be copied
      Alert.alert('contact us', OPERATOR.email);
    }
  };

  return (
    <Card title="about">
      <Row label="privacy policy" onPress={() => router.push('/legal/privacy')} />
      <Row label="terms of service" onPress={() => router.push('/legal/terms')} />
      <Row label="contact us" onPress={() => void contact()} last />
    </Card>
  );
}

function Row({ label, onPress, last = false }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} feel="soft" style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowChevron} />
    </Press>
  );
}

function DeleteAccount() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setPending(true);
    setError(null);
    const result = await deleteAccount();
    // on success the session is gone and the gate takes this screen to login
    if (result.error) {
      setError(result.error);
      setPending(false);
    }
  };

  const confirm = () =>
    Alert.alert(
      'delete your account?',
      'this permanently deletes your account and every couple you’ve been part of, with all the goals, photos and notes shared in it. your partner loses those too, and is unpaired. this can’t be undone.',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'delete account', style: 'destructive', onPress: () => void remove() },
      ],
    );

  return (
    <View style={styles.deleteBlock}>
      <Press onPress={confirm} disabled={pending} style={styles.quiet}>
        <Text style={styles.deleteLabel}>{pending ? 'deleting...' : 'delete account'}</Text>
      </Press>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEUTRAL.bg },
  content: { maxWidth: 430, width: '100%', alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontFamily: FONT.semibold, fontSize: 20, color: NEUTRAL.ink },
  headerSpacer: { width: 74 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 24,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontFamily: FONT.semibold, fontSize: 16, color: NEUTRAL.ink },
  label: { fontFamily: FONT.semibold, fontSize: 13, color: NEUTRAL.secondary, marginTop: 2 },
  body: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.secondary },
  hint: { fontFamily: FONT.medium, fontSize: 12, color: NEUTRAL.muted },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONT.regular,
    fontSize: 15,
    color: NEUTRAL.ink,
    backgroundColor: NEUTRAL.inputBg,
    // iOS recycles native text inputs between screens; see login.tsx
    letterSpacing: 0,
  },
  inputGrow: { flex: 1 },
  smallButton: {
    backgroundColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  smallButtonLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#FFFFFF' },
  dimmed: { opacity: 0.5 },
  outlineDanger: {
    borderWidth: 2,
    borderColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  outlineDangerLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#C94A76' },
  error: { fontFamily: FONT.medium, fontSize: 13, color: '#C94A76' },
  done: { fontFamily: FONT.medium, fontSize: 13, color: '#4A9C6D' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: 1.5, borderBottomColor: NEUTRAL.toggleTrack },
  rowLabel: { fontFamily: FONT.medium, fontSize: 15, color: NEUTRAL.ink },
  rowChevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
    borderColor: NEUTRAL.muted,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
    marginRight: 4,
  },
  quiet: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  quietLabel: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.muted },
  deleteBlock: { alignItems: 'center', gap: 4 },
  deleteLabel: { fontFamily: FONT.medium, fontSize: 14, color: '#C94A76' },
});
