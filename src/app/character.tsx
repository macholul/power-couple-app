import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChip } from '@/components/back-chip';
import { CharacterPicker } from '@/components/character-picker';
import { CharacterStage } from '@/components/character-stage';
import { Gate } from '@/components/gate';
import { Press } from '@/components/press';
import { setCharacter } from '@/lib/actions/account';
import { characterFor } from '@/lib/characters';
import { genderOf } from '@/lib/people';
import { sideTheme } from '@/lib/theme';
import { useRefreshViewer, useViewer } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Choosing a character, from account settings; sign-up has the same picker. */
export default function CharacterScreen() {
  return (
    <Gate area="account">
      <ChooseCharacter />
    </Gate>
  );
}

function ChooseCharacter() {
  const state = useViewer();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refreshViewer = useRefreshViewer();
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn =
    state.status === 'paired'
      ? { userId: state.viewer.userId, profile: state.viewer.profile }
      : state.status === 'unpaired' && state.profile
        ? { userId: state.userId, profile: state.profile }
        : null;
  if (!signedIn) return null;

  const { userId, profile } = signedIn;
  const gender = genderOf(profile);
  const current = characterFor(profile.avatar_character, gender);
  const selected = characterFor(chosen ?? current.key, gender);
  const theme = sideTheme(gender, selected.key);
  const changed = selected.key !== current.key;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    setError(null);
    const result = await setCharacter(userId, gender, selected.key);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    await refreshViewer();
    goBack();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <View style={styles.header}>
        <BackChip label="back" onPress={goBack} />
        <Text style={styles.headerTitle} accessibilityRole="header">
          character
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.card, { borderColor: theme.panelBorder }]}>
        <CharacterStage src={theme.waveImg} height={240} gradient={theme.profileStageGradient} />
        <Text style={[styles.name, { color: theme.deep }]}>{selected.name}</Text>
        <CharacterPicker
          gender={gender}
          value={selected.key}
          onChange={(next) => {
            setChosen(next);
            setError(null);
          }}
          disabled={saving}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Press
          onPress={() => void save()}
          disabled={!changed || saving}
          accessibilityState={{ disabled: !changed || saving, busy: saving }}
          style={[styles.save, { backgroundColor: theme.accent }, (!changed || saving) && styles.dimmed]}
        >
          <Text style={styles.saveLabel}>{saving ? 'saving...' : 'save'}</Text>
        </Press>
      </View>
    </ScrollView>
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
    borderRadius: 24,
    padding: 16,
    gap: 14,
    alignItems: 'stretch',
  },
  name: { fontFamily: FONT.semibold, fontSize: 18, textAlign: 'center' },
  error: { fontFamily: FONT.medium, fontSize: 13, color: '#C94A76', textAlign: 'center' },
  save: { borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  saveLabel: { fontFamily: FONT.semibold, fontSize: 16, color: '#FFFFFF' },
  dimmed: { opacity: 0.5 },
});
