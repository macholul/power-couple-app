import { Stack } from 'expo-router';

import { Gate } from '@/components/gate';

/**
 * Port of lib/viewer.ts's requireViewer(): signed out goes to login, signed
 * in but unpaired goes to pairing, everyone else gets through.
 *
 * The web app deliberately did NOT put this in a layout — a Next layout does
 * not re-run on client navigation, so the guard could go stale. React Native
 * has no such problem: this layout re-renders whenever the viewer context
 * changes, so a sign-out anywhere in the app ejects immediately.
 */
export default function AppLayout() {
  return (
    <Gate area="app">
      <Stack screenOptions={{ headerShown: false }} />
    </Gate>
  );
}
