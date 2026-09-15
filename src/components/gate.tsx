import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Press } from '@/components/press';
import { signOut } from '@/lib/actions/auth';
import { useAuth } from '@/lib/auth';
import { gateTarget, useRefreshViewer, useViewer, type GateArea } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * The client-side stand-in for the web app's server redirects.
 *
 * Next could decide before rendering anything, because the session came in
 * with the request. Here the session is restored from the Keychain and the
 * pairing status needs a round-trip, so there is a genuine "don't know yet"
 * window. Rendering the destination during that window is what causes the
 * classic login-screen flash on every cold start, so this holds on a screen
 * painted in the splash colour until the answer is real.
 */
export function Gate({ area, children }: { area: GateArea; children: ReactNode }) {
  const state = useViewer();
  const { recovering } = useAuth();

  // a reset code signs the person in; they stay here to choose a password
  if (area === 'auth' && recovering) return <>{children}</>;

  if (state.status === 'loading') return <GateLoading />;
  if (state.status === 'error') return <GateError />;
  const target = gateTarget(state, area);
  if (target) return <Redirect href={target} />;
  return <>{children}</>;
}

function GateLoading() {
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={NEUTRAL.muted} accessibilityLabel="Loading" />
    </View>
  );
}

/** Nothing could be loaded for this person yet, most likely no connection. */
function GateError() {
  const refresh = useRefreshViewer();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>can&apos;t reach powercouple</Text>
      <Text style={styles.body}>check your connection and try again</Text>
      <Press
        onPress={() => void retry()}
        disabled={retrying}
        style={[styles.button, retrying && styles.buttonBusy]}
      >
        <Text style={styles.buttonLabel}>{retrying ? 'trying...' : 'try again'}</Text>
      </Press>
      <Press onPress={() => void signOut()} style={styles.secondary}>
        <Text style={styles.secondaryLabel}>log out</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  // same cream as the splash screen, so the handover is invisible
  screen: {
    flex: 1,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontFamily: FONT.semibold, fontSize: 20, color: NEUTRAL.ink, textAlign: 'center' },
  body: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: NEUTRAL.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  button: {
    marginTop: 22,
    backgroundColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 34,
  },
  buttonBusy: { opacity: 0.7 },
  buttonLabel: { fontFamily: FONT.semibold, fontSize: 16, color: '#FFFFFF' },
  secondary: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 20 },
  secondaryLabel: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.muted },
});
