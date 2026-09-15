import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';

import { AuthProvider } from '@/lib/auth';
import { ViewerProvider } from '@/lib/viewer';
import { FONT, NEUTRAL } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/**
 * The last line of defence: any render error that nothing closer caught lands
 * here instead of a blank screen. The message stays out of release builds.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>something went wrong</Text>
      <Text style={styles.errorBody}>try again, and if it keeps happening, let us know</Text>
      {__DEV__ && <Text style={styles.errorDetail}>{error.message}</Text>}
      <Pressable onPress={() => void retry()} accessibilityRole="button" style={styles.errorButton}>
        <Text style={styles.errorButtonLabel}>try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  // Fredoka is the app's only typeface. Unlike the web, React Native cannot
  // synthesise weights: each weight is a separately registered family name,
  // so all four the design uses are loaded up front.
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    // hide once fonts are in, or if they failed — never leave a stuck splash
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <ViewerProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: NEUTRAL.bg },
          }}
        />
      </ViewerProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: { fontFamily: FONT.semibold, fontSize: 20, color: NEUTRAL.ink, textAlign: 'center' },
  errorBody: {
    fontFamily: FONT.medium,
    fontSize: 14,
    color: NEUTRAL.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  errorDetail: {
    fontFamily: FONT.regular,
    fontSize: 12,
    color: '#C94A76',
    textAlign: 'center',
    marginTop: 12,
  },
  errorButton: {
    marginTop: 22,
    backgroundColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 34,
  },
  errorButtonLabel: { fontFamily: FONT.semibold, fontSize: 16, color: '#FFFFFF' },
});
