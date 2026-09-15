import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChip } from '@/components/back-chip';
import { ATTRIBUTION, EFFECTIVE_DATE, type LegalDocument } from '@/content/legal';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Renders a policy from src/content/legal. Readable signed in or out. */
export function LegalDocumentScreen({ document }: { document: LegalDocument }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <View style={styles.header}>
        <BackChip
          label="back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {document.title}
      </Text>
      <Text style={styles.effective}>last updated {EFFECTIVE_DATE}</Text>

      {document.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading} accessibilityRole="header">
            {section.heading}
          </Text>
          {section.blocks.map((block, index) =>
            block.kind === 'paragraph' ? (
              <Text key={index} style={styles.paragraph}>
                {block.lead ? <Text style={styles.lead}>{block.lead} </Text> : null}
                {block.text}
              </Text>
            ) : (
              <View key={index} style={styles.list}>
                {block.items.map((item) => (
                  <View key={item} style={styles.item}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            ),
          )}
        </View>
      ))}

      <Text style={styles.attribution}>{ATTRIBUTION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEUTRAL.bg },
  content: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingHorizontal: 22 },
  header: { flexDirection: 'row', marginBottom: 18 },
  title: { fontFamily: FONT.semibold, fontSize: 28, color: NEUTRAL.ink },
  effective: { fontFamily: FONT.medium, fontSize: 13, color: NEUTRAL.muted, marginTop: 2 },
  section: { marginTop: 22, gap: 8 },
  heading: { fontFamily: FONT.semibold, fontSize: 18, color: NEUTRAL.ink },
  paragraph: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: NEUTRAL.secondary },
  lead: { fontFamily: FONT.semibold, color: NEUTRAL.ink },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  bullet: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 22, color: NEUTRAL.muted },
  itemText: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 22,
    color: NEUTRAL.secondary,
  },
  attribution: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
    color: NEUTRAL.muted,
    marginTop: 30,
  },
});
