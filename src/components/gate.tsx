import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';

import { gateTarget, useViewer } from '@/lib/viewer';
import { NEUTRAL } from '@/constants/theme';

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
export function Gate({
  area,
  children,
}: {
  area: 'app' | 'auth' | 'pairing';
  children: ReactNode;
}) {
  const state = useViewer();
  const target = gateTarget(state, area);

  if (state.status === 'loading') return <GateLoading />;
  if (target) return <Redirect href={target} />;
  return <>{children}</>;
}

function GateLoading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={NEUTRAL.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  // same cream as the splash screen, so the handover is invisible
  loading: {
    flex: 1,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
