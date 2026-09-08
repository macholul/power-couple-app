import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * Stand-in for a screen that lands in a later step. Renders the route it is
 * standing in for so the navigation shell can be walked and verified before
 * any of the real UI exists.
 */
export function Placeholder({
  title,
  route,
  step,
  detail,
  links = [],
}: {
  title: string;
  route: string;
  step: string;
  detail?: string;
  links?: { label: string; href: Href }[];
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.wordmark}>
        <Text style={styles.power}>power</Text>
        <Text style={styles.couple}>couple</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.route}>{route}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        <Text style={styles.step}>arrives in {step}</Text>
      </View>

      {links.map((link) => (
        <Link key={link.href as string} href={link.href} style={styles.link}>
          {link.label}
        </Link>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  wordmark: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  power: { fontFamily: FONT.semibold, fontSize: 28, color: '#E5628E', letterSpacing: 0.5 },
  couple: { fontFamily: FONT.semibold, fontSize: 28, color: '#5B8AD6' },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 24,
    padding: 18,
    gap: 4,
    alignItems: 'center',
  },
  title: { fontFamily: FONT.semibold, fontSize: 19, color: NEUTRAL.ink },
  route: { fontFamily: FONT.regular, fontSize: 13, color: NEUTRAL.muted },
  detail: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: NEUTRAL.secondary,
    textAlign: 'center',
    marginTop: 6,
  },
  step: { fontFamily: FONT.medium, fontSize: 12, color: NEUTRAL.placeholder, marginTop: 6 },
  link: {
    fontFamily: FONT.semibold,
    fontSize: 15,
    color: '#E5628E',
    paddingVertical: 6,
  },
});
