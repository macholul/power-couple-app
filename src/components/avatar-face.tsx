import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';

/** Port of components/AvatarFace.tsx — a 34px circular close-up of the face. */
export function AvatarFace({
  src,
  background,
}: {
  src: ImageSourcePropType;
  background: string;
}) {
  return (
    <View style={[styles.ring, { backgroundColor: background }]}>
      <Image source={src} style={styles.face} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  face: { width: '100%', height: '100%' },
});
