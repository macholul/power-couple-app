import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';

import { Gate } from '@/components/gate';
import { FloatingHearts } from '@/components/floating-hearts';
import { createInvite, existingInvite, redeemInvite } from '@/lib/actions/pairing';
import { signOut } from '@/lib/actions/auth';
import { useAuth } from '@/lib/auth';
import { useRefreshViewer } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

const CODE_PLACEHOLDER = '······';
/** how often the inviter's screen checks whether their code was redeemed */
const WATCH_INTERVAL_MS = 5_000;

function YourCodePanel({ userId }: { userId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestedInitial = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generate = useCallback(async () => {
    setPending(true);
    setError(null);
    const result = await createInvite();
    if (result.error) setError(result.error);
    else setCode(result.code ?? null);
    setPending(false);
  }, []);

  useEffect(() => {
    // The web rendered any outstanding code server-side and only generated on
    // mount when there was none. Same shape here: look first, then create.
    if (requestedInitial.current) return;
    requestedInitial.current = true;
    void (async () => {
      const found = await existingInvite(userId);
      if (found) setCode(found);
      else await generate();
    })();
  }, [userId, generate]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const chars = (code ?? CODE_PLACEHOLDER).split('');

  return (
    <View style={styles.maePanel}>
      <Text style={styles.maeTitle}>your code</Text>

      <View
        style={styles.codeRow}
        accessible
        accessibilityLabel={code ? `Your code: ${code.split('').join(' ')}` : 'Making your code'}
      >
        {chars.map((char, index) => (
          <View key={index} style={styles.codeBox}>
            <Text style={styles.codeChar}>{char}</Text>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => void generate()}
          disabled={pending}
          style={({ pressed }) => [
            styles.outlineButton,
            { opacity: pending ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.outlineLabel}>new code</Text>
        </Pressable>
        <Pressable
          onPress={() => void copy()}
          style={({ pressed }) => [
            styles.solidPink,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.solidLabel}>{copied ? 'copied' : 'copy'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.maeError}>{error}</Text> : null}

      <Text style={styles.maeHint}>send this to your partner so they can join you</Text>
    </View>
  );
}

function EnterCodePanel() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const refreshViewer = useRefreshViewer();

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await redeemInvite(code);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    // The couple row now exists but the viewer context predates it, so the
    // gate would still read "unpaired". Re-read, and it routes to home.
    await refreshViewer();
  };

  return (
    <View style={styles.barisPanel}>
      <Text style={styles.barisTitle}>enter your partner&apos;s code</Text>

      <TextInput
        style={styles.codeInput}
        value={code}
        // the RPC upper()s anyway; doing it here keeps the field honest
        onChangeText={(next) => setCode(next.toUpperCase())}
        maxLength={6}
        placeholder="ABC123"
        placeholderTextColor="#A9C6F0"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      {error ? <Text style={styles.barisError}>{error}</Text> : null}

      <Pressable
        onPress={() => void submit()}
        disabled={pending}
        style={({ pressed }) => [
          styles.solidBlue,
          { opacity: pending ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.pairUpLabel}>{pending ? 'pairing...' : 'pair up'}</Text>
      </Pressable>
    </View>
  );
}

export default function PairingScreen() {
  return (
    <Gate area="pairing">
      <PairingContent />
    </Gate>
  );
}

function PairingContent() {
  const { user } = useAuth();
  const router = useRouter();
  const refreshViewer = useRefreshViewer();

  // The partner redeems the code on their own phone, so nothing here would
  // notice. Re-reading the couple every few seconds lets the gate move this
  // screen on by itself once they have.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void refreshViewer();
      }, WATCH_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [refreshViewer]),
  );

  if (!user) return null; // the gate is already routing away

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <FloatingHearts variant="pairing" />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Text style={styles.heading}>pair with your person</Text>
            <Text style={styles.subheading}>one code links your two accounts</Text>
          </View>

          <YourCodePanel userId={user.id} />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <EnterCodePanel />

          <View style={styles.footer}>
            <Text style={styles.signedInAs}>signed in as {user.email}</Text>
            <View style={styles.footerLinks}>
              <Pressable
                onPress={() => router.push('/account')}
                accessibilityRole="button"
                style={styles.logout}
              >
                <Text style={styles.logoutLabel}>account</Text>
              </Pressable>
              <Pressable
                onPress={() => void signOut()}
                accessibilityRole="button"
                style={styles.logout}
              >
                <Text style={styles.logoutLabel}>log out</Text>
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
  header: { alignItems: 'center', marginBottom: 26 },
  heading: { fontFamily: FONT.semibold, fontSize: 26, color: NEUTRAL.ink },
  subheading: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.muted, marginTop: 4 },

  // --- your code (mae / pink) ---
  maePanel: {
    backgroundColor: '#FFE3EE',
    borderWidth: 2,
    borderColor: '#FFC9DE',
    borderRadius: 28,
    padding: 20,
  },
  maeTitle: { fontFamily: FONT.semibold, fontSize: 15, color: '#C94A76', textAlign: 'center' },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 },
  codeBox: {
    width: 44,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C94A76',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  codeChar: { fontFamily: FONT.semibold, fontSize: 24, color: '#E5628E' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  outlineButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  outlineLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#E5628E' },
  solidPink: {
    flex: 1,
    backgroundColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  solidLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#FFFFFF' },
  maeError: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: '#C94A76',
    textAlign: 'center',
    marginTop: 10,
  },
  maeHint: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: '#D18AA5',
    textAlign: 'center',
    marginTop: 10,
  },

  // --- divider ---
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 2, backgroundColor: NEUTRAL.cardBorder, borderRadius: 2 },
  dividerLabel: { fontFamily: FONT.semibold, fontSize: 13, color: NEUTRAL.placeholder },

  // --- enter code (baris / blue) ---
  barisPanel: {
    backgroundColor: '#E3EFFF',
    borderWidth: 2,
    borderColor: '#C9DFFF',
    borderRadius: 28,
    padding: 20,
  },
  barisTitle: { fontFamily: FONT.semibold, fontSize: 15, color: '#4A79C9', textAlign: 'center' },
  codeInput: {
    marginVertical: 14,
    borderWidth: 2,
    borderColor: '#C9DFFF',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontFamily: FONT.semibold,
    fontSize: 22,
    letterSpacing: 10,
    textAlign: 'center',
    color: '#4A79C9',
    backgroundColor: '#FFFFFF',
  },
  barisError: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: '#4A79C9',
    textAlign: 'center',
    marginBottom: 10,
  },
  solidBlue: {
    backgroundColor: '#5B8AD6',
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#5B8AD6',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
  pairUpLabel: { fontFamily: FONT.semibold, fontSize: 16, color: '#FFFFFF' },

  // --- footer ---
  footer: { alignItems: 'center', marginTop: 22 },
  footerLinks: { flexDirection: 'row' },
  signedInAs: { fontFamily: FONT.medium, fontSize: 12, color: NEUTRAL.placeholder },
  logout: { paddingVertical: 8, paddingHorizontal: 20 },
  logoutLabel: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: NEUTRAL.muted,
    textDecorationLine: 'underline',
  },
});
