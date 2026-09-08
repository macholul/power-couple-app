import { Pressable, StyleSheet, Text } from 'react-native';

import { Gate } from '@/components/gate';
import { Placeholder } from '@/components/placeholder';
import { signOut } from '@/lib/actions/auth';
import { useAuth } from '@/lib/auth';
import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * Port target for app/pairing/page.tsx. It sits outside both groups, exactly
 * as on the web, and carries its own guard: signed-out users belong on login,
 * already-paired users belong in the app.
 */
export default function PairingScreen() {
  const { user } = useAuth();

  return (
    <Gate area="pairing">
      <Placeholder
        title="pair with your person"
        route="/pairing"
        step="step 6"
        detail="one code links your two accounts forever"
      />
      <Text style={styles.signedInAs}>signed in as {user?.email}</Text>
      <Pressable onPress={() => void signOut()} style={styles.logout}>
        <Text style={styles.logoutLabel}>log out</Text>
      </Pressable>
    </Gate>
  );
}

const styles = StyleSheet.create({
  signedInAs: {
    fontFamily: FONT.medium,
    fontSize: 12,
    color: NEUTRAL.placeholder,
    textAlign: 'center',
  },
  logout: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 24 },
  logoutLabel: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: NEUTRAL.muted,
    textDecorationLine: 'underline',
  },
});
