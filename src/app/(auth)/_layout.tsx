import { Stack } from 'expo-router';

import { Gate } from '@/components/gate';

/** Port of the web app's app/(auth)/layout.tsx guard. */
export default function AuthLayout() {
  return (
    <Gate area="auth">
      <Stack screenOptions={{ headerShown: false }} />
    </Gate>
  );
}
