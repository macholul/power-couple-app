import { Pressable, StyleSheet, Text } from 'react-native';

import { Placeholder } from '@/components/placeholder';
import { signOut } from '@/lib/actions/auth';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Port target for app/(app)/profile/page.tsx — goals, streaks, love notes. */
export default function ProfileScreen() {
  return (
    <>
      <Placeholder
        title="my profile"
        route="/profile"
        step="step 9"
        links={[{ label: '← home', href: '/' }]}
      />
      <Pressable onPress={() => void signOut()} style={styles.logout}>
        <Text style={styles.logoutLabel}>log out</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  logout: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 32 },
  logoutLabel: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: NEUTRAL.muted,
    textDecorationLine: 'underline',
  },
});
