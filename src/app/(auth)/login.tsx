import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { signIn, signUp } from '@/lib/actions/auth';
import { FloatingHearts } from '@/components/floating-hearts';
import { HeartIcon } from '@/components/heart-icon';
import { Wordmark } from '@/components/wordmark';
import { FONT, NEUTRAL } from '@/constants/theme';
import type { AvatarCharacter } from '@/lib/types/database';

const CHARACTERS: { key: AvatarCharacter; label: string; color: string; chip: string }[] = [
  { key: 'mae', label: 'pink', color: '#E5628E', chip: '#FFD1E3' },
  { key: 'baris', label: 'blue', color: '#5B8AD6', chip: '#C9DFFF' },
];

function ToggleButton({
  active,
  activeColor,
  onPress,
  children,
}: {
  active: boolean;
  activeColor: string;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, active && { backgroundColor: activeColor }]}
    >
      <Text style={[styles.toggleLabel, active ? styles.toggleLabelOn : styles.toggleLabelOff]}>
        {children}
      </Text>
    </Pressable>
  );
}

function CharacterChoice({
  value,
  onChange,
}: {
  value: AvatarCharacter;
  onChange: (next: AvatarCharacter) => void;
}) {
  return (
    <View style={styles.characterRow}>
      {CHARACTERS.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.character,
              {
                borderColor: active ? option.color : NEUTRAL.cardBorder,
                backgroundColor: active ? option.chip : NEUTRAL.inputBg,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <HeartIcon size={14} color={active ? option.color : '#E8D5C4'} />
            <Text
              style={[styles.characterLabel, { color: active ? option.color : NEUTRAL.muted }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [character, setCharacter] = useState<AvatarCharacter>('mae');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isLogin = mode === 'login';

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = isLogin
      ? await signIn(email.trim(), password)
      : await signUp({ name, email: email.trim(), password, character });
    // On success the gate navigates away and this screen unmounts, so only the
    // failure path needs to put the form back.
    if (result.error) {
      setError(result.error);
      setPending(false);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <FloatingHearts variant="login" />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Wordmark size={34} />
            <Text style={styles.tagline}>reach your goals, together</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.toggleTrack}>
              <ToggleButton
                active={isLogin}
                activeColor="#E5628E"
                onPress={() => switchMode('login')}
              >
                log in
              </ToggleButton>
              <ToggleButton
                active={!isLogin}
                activeColor="#5B8AD6"
                onPress={() => switchMode('signup')}
              >
                sign up
              </ToggleButton>
            </View>

            <View style={styles.form}>
              {!isLogin && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="your name"
                    placeholderTextColor={NEUTRAL.placeholder}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <CharacterChoice value={character} onChange={setCharacter} />
                </>
              )}
              <TextInput
                style={styles.input}
                placeholder="email"
                placeholderTextColor={NEUTRAL.placeholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                placeholder="password"
                placeholderTextColor={NEUTRAL.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={() => void submit()}
                disabled={pending}
                style={({ pressed }) => [
                  styles.submit,
                  {
                    backgroundColor: isLogin ? '#E5628E' : '#5B8AD6',
                    opacity: pending ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Text style={styles.submitLabel}>
                  {pending ? 'one sec...' : isLogin ? 'log in' : 'create account'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: NEUTRAL.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
  },
  header: { alignItems: 'center', marginBottom: 28 },
  tagline: { fontFamily: FONT.medium, fontSize: 15, color: NEUTRAL.muted, marginTop: 4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 20,
    // the web's `0 8px 30px rgba(229,98,142,0.08)`
    shadowColor: '#E5628E',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 30,
    elevation: 3,
  },
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: NEUTRAL.toggleTrack,
    borderRadius: 999,
    padding: 4,
    gap: 4,
    marginBottom: 20,
  },
  toggle: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  toggleLabel: { fontFamily: FONT.semibold, fontSize: 15 },
  toggleLabelOn: { color: '#FFFFFF' },
  toggleLabelOff: { color: NEUTRAL.muted },
  form: { gap: 12 },
  input: {
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontFamily: FONT.regular,
    fontSize: 15,
    color: NEUTRAL.ink,
    backgroundColor: NEUTRAL.inputBg,
  },
  characterRow: { flexDirection: 'row', gap: 8 },
  character: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 10,
  },
  characterLabel: { fontFamily: FONT.semibold, fontSize: 14 },
  error: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: '#C94A76',
    textAlign: 'center',
  },
  submit: {
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 4,
    alignItems: 'center',
    shadowColor: '#E5628E',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  submitLabel: { fontFamily: FONT.semibold, fontSize: 17, color: '#FFFFFF' },
});
