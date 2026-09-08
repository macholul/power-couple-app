import { Stack } from 'expo-router';

import { Gate } from '@/components/gate';
import { CoupleDataProvider } from '@/lib/couple-data';

/**
 * Port of lib/viewer.ts's requireViewer(): signed out goes to login, signed
 * in but unpaired goes to pairing, everyone else gets through.
 *
 * The web app deliberately did NOT put this in a layout — a Next layout does
 * not re-run on client navigation, so the guard could go stale. React Native
 * has no such problem: this layout re-renders whenever the viewer context
 * changes, so a sign-out anywhere in the app ejects immediately.
 *
 * The couple's data lives here too, inside the gate. Home and profile read
 * the same snapshot, so moving between them no longer refetches — the web
 * paid for a full server render on each navigation.
 */
export default function AppLayout() {
  return (
    <Gate area="app">
      <CoupleDataProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </CoupleDataProvider>
    </Gate>
  );
}
