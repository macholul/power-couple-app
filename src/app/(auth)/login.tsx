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
import { useRouter } from 'expo-router';

import {
  changePassword,
  confirmSignUp,
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  resendSignUpCode,
  resetPassword,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
} from '@/lib/actions/auth';
import { useAuth } from '@/lib/auth';
import { OPERATOR } from '@/content/legal';
import { FloatingHearts } from '@/components/floating-hearts';
import { GenderChoice } from '@/components/gender-choice';
import { Wordmark } from '@/components/wordmark';
import { FONT, NEUTRAL } from '@/constants/theme';
import type { Gender } from '@/lib/types/database';

/**
 * - login / signup  the two tabs
 * - confirm         enter the code from the sign-up email (when the project
 *                   requires email confirmation, signing up gives no session)
 * - forgot          ask for a password reset code
 * - reset           enter that code and a new password
 */
type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset';

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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.toggle, active && { backgroundColor: activeColor }]}
    >
      <Text style={[styles.toggleLabel, active ? styles.toggleLabelOn : styles.toggleLabelOff]}>
        {children}
      </Text>
    </Pressable>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.textLink} hitSlop={6}>
      <Text style={styles.textLinkLabel}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { recovering } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [gender, setGender] = useState<Gender | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A verified reset code has already signed the person in; all that is left
  // is choosing the new password, whatever this screen was showing.
  const current: Mode = recovering ? 'reset' : mode;
  const isLogin = current === 'login';
  const address = email.trim();

  const goTo = (next: Mode, message: string | null = null) => {
    setMode(next);
    setError(null);
    setNotice(message);
    setPending(false);
  };

  const begin = () => {
    setPending(true);
    setError(null);
    setNotice(null);
  };

  // On success most actions sign in, the gate navigates away and this screen
  // unmounts, so only failures need to put the form back.
  const fail = (message: string) => {
    setError(message);
    setPending(false);
  };

  const submit = async () => {
    if (pending) return;
    switch (current) {
      case 'login': {
        begin();
        const result = await signIn(address, password);
        if (result.unconfirmed) goTo('confirm', result.error);
        else if (result.error) fail(result.error);
        return;
      }
      case 'signup': {
        if (!gender) return fail('are you a woman or a man?');
        begin();
        const result = await signUp({ name, email: address, password, gender });
        if (result.error) return fail(result.error);
        if (result.needsConfirmation) {
          setPassword('');
          goTo('confirm', `we emailed a code to ${address}`);
        }
        return;
      }
      case 'confirm': {
        begin();
        const result = await confirmSignUp(address, code);
        if (result.error) fail(result.error);
        return;
      }
      case 'forgot': {
        begin();
        const result = await sendPasswordReset(address);
        if (result.error) return fail(result.error);
        setCode('');
        setPassword('');
        goTo(
          'reset',
          result.known ? `we emailed a code to ${address}` : `if ${address} has an account, we emailed it a code`,
        );
        return;
      }
      case 'reset': {
        begin();
        const result = recovering
          ? await changePassword(password)
          : await resetPassword(address, code, password);
        if (result.error) fail(result.error);
        return;
      }
    }
  };

  const resend = async () => {
    begin();
    const result = await resendSignUpCode(address);
    setPending(false);
    if (result.error) setError(result.error);
    else setNotice('we sent a new code');
  };

  const leaveReset = async () => {
    // the verified code left a session behind; without a new password, drop it
    if (recovering) await signOut();
    goTo('login');
  };

  const submitLabel = pending
    ? 'one sec...'
    : {
        login: 'log in',
        signup: 'create account',
        confirm: 'confirm',
        forgot: 'send code',
        reset: 'save password',
      }[current];

  const accent = current === 'signup' ? '#5B8AD6' : '#E5628E';

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
            {(current === 'login' || current === 'signup') && (
              <View style={styles.toggleTrack} accessibilityRole="tablist">
                <ToggleButton active={isLogin} activeColor="#E5628E" onPress={() => goTo('login')}>
                  log in
                </ToggleButton>
                <ToggleButton active={!isLogin} activeColor="#5B8AD6" onPress={() => goTo('signup')}>
                  sign up
                </ToggleButton>
              </View>
            )}

            {current === 'confirm' && (
              <Text style={styles.stepTitle} accessibilityRole="header">
                check your email
              </Text>
            )}
            {current === 'forgot' && (
              <Text style={styles.stepTitle} accessibilityRole="header">
                reset your password
              </Text>
            )}
            {current === 'reset' && (
              <Text style={styles.stepTitle} accessibilityRole="header">
                choose a new password
              </Text>
            )}

            <View style={styles.form}>
              {current === 'signup' && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="your name"
                    placeholderTextColor={NEUTRAL.placeholder}
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_NAME_LENGTH}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="givenName"
                    returnKeyType="next"
                    accessibilityLabel="Your name"
                  />
                  <GenderChoice value={gender} onChange={setGender} />
                </>
              )}

              {(current === 'login' || current === 'signup' || current === 'forgot') && (
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
                  textContentType="emailAddress"
                  returnKeyType={current === 'forgot' ? 'send' : 'next'}
                  onSubmitEditing={current === 'forgot' ? () => void submit() : undefined}
                  accessibilityLabel="Email"
                />
              )}

              {(current === 'confirm' || (current === 'reset' && !recovering)) && (
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="code from the email"
                  placeholderTextColor={NEUTRAL.placeholder}
                  value={code}
                  onChangeText={(next) => setCode(next.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  returnKeyType={current === 'confirm' ? 'go' : 'next'}
                  onSubmitEditing={current === 'confirm' ? () => void submit() : undefined}
                  accessibilityLabel="Code from the email"
                />
              )}

              {(current === 'login' || current === 'signup' || current === 'reset') && (
                <TextInput
                  style={styles.input}
                  placeholder={
                    current === 'login' ? 'password' : `new password (${MIN_PASSWORD_LENGTH}+ characters)`
                  }
                  placeholderTextColor={NEUTRAL.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={current === 'login' ? 'current-password' : 'new-password'}
                  textContentType={current === 'login' ? 'password' : 'newPassword'}
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel={current === 'login' ? 'Password' : 'New password'}
                />
              )}

              {notice ? (
                <Text style={styles.notice} accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              ) : null}
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="assertive">
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={() => void submit()}
                disabled={pending}
                accessibilityRole="button"
                accessibilityState={{ disabled: pending, busy: pending }}
                style={({ pressed }) => [
                  styles.submit,
                  {
                    backgroundColor: accent,
                    opacity: pending ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}
              >
                <Text style={styles.submitLabel}>{submitLabel}</Text>
              </Pressable>

              {current === 'signup' && (
                <Text style={styles.consent}>
                  by creating an account you confirm you&apos;re {OPERATOR.minimumAge} or older and
                  agree to our{' '}
                  <Text
                    style={styles.consentLink}
                    accessibilityRole="link"
                    onPress={() => router.push('/legal/terms')}
                  >
                    terms
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={styles.consentLink}
                    accessibilityRole="link"
                    onPress={() => router.push('/legal/privacy')}
                  >
                    privacy policy
                  </Text>
                </Text>
              )}

              {current === 'login' && (
                <TextLink label="forgot your password?" onPress={() => goTo('forgot')} />
              )}
              {current === 'confirm' && (
                <View style={styles.linkRow}>
                  <TextLink label="send a new code" onPress={() => void resend()} />
                  <TextLink label="back to log in" onPress={() => goTo('login')} />
                </View>
              )}
              {current === 'confirm' && (
                <Text style={styles.hint}>
                  if the email has a link instead, tap it, then come back and log in
                </Text>
              )}
              {current === 'forgot' && (
                <TextLink label="back to log in" onPress={() => goTo('login')} />
              )}
              {current === 'reset' && (
                <TextLink label="cancel" onPress={() => void leaveReset()} />
              )}
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
  stepTitle: {
    fontFamily: FONT.semibold,
    fontSize: 20,
    color: NEUTRAL.ink,
    textAlign: 'center',
    marginBottom: 16,
  },
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
    // Explicit, not cosmetic: iOS recycles the native UITextField between
    // screens, and an unset letterSpacing keeps whatever the previous tenant
    // had. Without this, arriving from /pairing (code input, letterSpacing 10)
    // renders this placeholder as "e m a i l".
    letterSpacing: 0,
  },
  codeInput: { textAlign: 'center', fontFamily: FONT.semibold, fontSize: 18 },
  notice: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: NEUTRAL.secondary,
    textAlign: 'center',
  },
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
  consent: {
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 17,
    color: NEUTRAL.muted,
    textAlign: 'center',
  },
  consentLink: { fontFamily: FONT.semibold, color: NEUTRAL.secondary, textDecorationLine: 'underline' },
  textLink: { alignSelf: 'center', paddingVertical: 4 },
  textLinkLabel: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: NEUTRAL.muted,
    textDecorationLine: 'underline',
  },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  hint: {
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 17,
    color: NEUTRAL.placeholder,
    textAlign: 'center',
  },
});
