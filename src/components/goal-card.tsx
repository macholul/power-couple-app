import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Press } from '@/components/press';
import { submitProof, confirmProof } from '@/lib/actions/completions';
import { signedPhotoUrl } from '@/lib/photos';
import type { SideTheme } from '@/lib/theme';
import { FONT, NEUTRAL } from '@/constants/theme';

export type GoalCardState = 'todo' | 'proof' | 'confirmed';

const LIGHTBOX_PADDING = 20;

/**
 * Port of components/GoalCard.tsx.
 *
 * Two things genuinely change shape in the port:
 *
 *  - Picking a photo. `<input type="file" accept="image/*">` let mobile
 *    Safari offer camera-or-library itself. There is no such control here, so
 *    the choice is an Alert, and each branch needs its own permission.
 *  - Showing a photo. The web had a route handler streaming the file through
 *    the session at a stable URL. Here the device mints a signed URL, cached
 *    by storage path in lib/photos so re-renders do not re-sign it.
 *
 * The optimistic update the web got from useOptimistic is local state that
 * `refresh()` overwrites when the real row lands.
 */
export function GoalCard({
  coupleId,
  taskId,
  label,
  state,
  photoPath,
  completionId,
  isMine,
  reviewerName,
  theme,
  onChanged,
}: {
  coupleId: string;
  taskId: string;
  label: string;
  state: GoalCardState;
  photoPath: string | null;
  completionId: string | null;
  isMine: boolean;
  reviewerName: string;
  theme: SideTheme;
  /** resolves once the refreshed rows have landed */
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // optimistic overlay; cleared implicitly when new props arrive
  const [optimistic, setOptimistic] = useState<{
    state: GoalCardState;
    localUri: string | null;
  } | null>(null);

  const view = optimistic ?? { state, localUri: null };
  const remoteUrl = useSignedPhoto(view.localUri ? null : photoPath);
  const photo = view.localUri ?? remoteUrl;

  // The overlay is held until the refreshed rows have actually landed, not
  // until the card's state happens to match. A retake never changes `state`
  // (proof -> proof), so comparing state would drop the new photo on the very
  // next render and snap the card back to the old one.
  const onPickPhoto = async () => {
    const asset = await pickPhoto();
    if (!asset) return;

    setBusy(true);
    setError(null);
    setOptimistic({ state: 'proof', localUri: asset.uri });
    const result = await submitProof(coupleId, taskId, {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setOptimistic(null);
      return;
    }
    await onChanged();
    setOptimistic(null);
  };

  const onConfirm = async () => {
    if (!completionId) return;
    setBusy(true);
    setOptimistic({ state: 'confirmed', localUri: null });
    const result = await confirmProof(completionId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      setOptimistic(null);
      return;
    }
    await onChanged();
    setOptimistic(null);
  };

  return (
    <View style={[styles.card, { shadowColor: theme.shadowSoft }]}>
      {view.state === 'todo' && (
        <View style={styles.todoRow}>
          <Text style={styles.todoLabel}>{label}</Text>
          {isMine && (
            <Press
              onPress={() => void onPickPhoto()}
              disabled={busy}
              feel="hard"
              accessibilityLabel="Add photo proof"
              style={[
                styles.cameraButton,
                {
                  borderColor: theme.dashedBorder,
                  backgroundColor: theme.tintBg,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            >
              <CameraGlyph accent={theme.accent} lens={theme.tintBg} />
            </Press>
          )}
        </View>
      )}

      {view.state === 'proof' && photo && (
        <View style={styles.proofColumn}>
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="View proof photo"
          >
            <Image
              source={{ uri: photo }}
              style={[styles.photo, { backgroundColor: theme.tintBg }]}
              contentFit="cover"
            />
          </Pressable>
          <Text style={[styles.proofLabel, { color: theme.mutedText }]}>{label}</Text>
          {isMine ? (
            <>
              <View style={[styles.pill, { backgroundColor: theme.accent, opacity: 0.55 }]}>
                <Text style={styles.pillLabel}>{reviewerName} confirms</Text>
              </View>
              <Press onPress={() => void onPickPhoto()} disabled={busy} style={styles.retake}>
                <Text style={[styles.retakeLabel, { color: theme.mutedText }]}>
                  {busy ? 'uploading...' : 'wrong photo? retake'}
                </Text>
              </Press>
            </>
          ) : (
            <Press
              onPress={() => void onConfirm()}
              disabled={busy}
              feel="soft"
              style={[
                styles.pill,
                { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.pillLabel}>{reviewerName} confirms</Text>
            </Press>
          )}
        </View>
      )}

      {view.state === 'confirmed' && photo && (
        <View>
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="View proof photo"
          >
            <Image
              source={{ uri: photo }}
              style={[
                styles.photo,
                { borderWidth: 3, borderColor: theme.accent, backgroundColor: theme.tintBg },
              ]}
              contentFit="cover"
            />
          </Pressable>
          <View style={[styles.tick, { backgroundColor: theme.accent }]}>
            <View style={styles.tickMark} />
          </View>
          <Text style={[styles.doneLabel, { color: theme.deep }]}>{label} — done</Text>
        </View>
      )}

      {error && <Text style={[styles.error, { color: theme.deep }]}>{error}</Text>}

      {expanded && photo && (
        <PhotoLightbox uri={photo} onClose={() => setExpanded(false)} />
      )}
    </View>
  );
}

/**
 * Port of the web's PhotoLightbox. That one was a React portal, because the
 * animating panels trapped `position: fixed` inside their transform; a native
 * Modal is presented outside the view hierarchy already, so the portal is not
 * needed.
 *
 * The web sized the photo with `max-width: 100%; max-height: 90vh` and let the
 * <img> keep its own aspect ratio, so `border-radius` clipped the picture
 * itself. `contentFit="contain"` letterboxes inside a fixed box instead, which
 * would round a box the photo does not fill — so the fitted size is computed
 * here and the view ends up exactly the size of the picture.
 */
function PhotoLightbox({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [aspect, setAspect] = useState<number | null>(null);

  const maxWidth = screenWidth - LIGHTBOX_PADDING * 2;
  const maxHeight = screenHeight * 0.9;
  // the largest box with the picture's aspect ratio that fits both caps
  const height = aspect === null ? 0 : Math.min(maxHeight, maxWidth / aspect);
  const fitted = aspect === null ? null : { width: height * aspect, height };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.lightbox}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
      >
        <Image
          source={{ uri }}
          style={[styles.lightboxPhoto, fitted]}
          contentFit="contain"
          onLoad={(event) =>
            setAspect(event.source.width / event.source.height)
          }
        />
      </Pressable>
    </Modal>
  );
}

/** Resolves a storage path to a signed URL, or null while it is being minted. */
function useSignedPhoto(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    void signedPhotoUrl(path).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}

/**
 * The camera-or-library choice mobile Safari made for the web's file input.
 * Each branch asks for its own permission first: launching without one shows
 * an empty picker on iOS rather than an error.
 */
async function pickPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const source = await new Promise<'camera' | 'library' | null>((resolve) => {
    Alert.alert('photo proof', undefined, [
      { text: 'take a photo', onPress: () => resolve('camera') },
      { text: 'choose from library', onPress: () => resolve('library') },
      { text: 'cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
  if (!source) return null;

  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  // quality 1 here on purpose: lib/photos re-encodes at 0.8 after downscaling,
  // and compressing twice would only add artefacts
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/** The inline SVG camera icon from the web's todo state. */
function CameraGlyph({ accent, lens }: { accent: string; lens: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={2} y={7} width={20} height={14} rx={5} fill={accent} />
      <Rect x={8} y={3} width={8} height={6} rx={2.5} fill={accent} />
      <Circle cx={12} cy={14} r={4} fill={lens} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  todoLabel: {
    flex: 1,
    fontFamily: FONT.medium,
    fontSize: 14,
    lineHeight: 17.5,
    color: NEUTRAL.ink,
  },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofColumn: { gap: 8 },
  photo: { width: '100%', height: 100, borderRadius: 12 },
  proofLabel: { fontFamily: FONT.medium, fontSize: 12, textAlign: 'center' },
  pill: { paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  pillLabel: { fontFamily: FONT.semibold, fontSize: 13, color: '#FFFFFF' },
  retake: { alignItems: 'center' },
  retakeLabel: {
    fontFamily: FONT.medium,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  // the web drew this as a rotated element with only two borders; RN keeps
  // per-side border widths, so the same trick carries over unchanged
  tick: {
    position: 'absolute',
    top: -6,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: {
    width: 10,
    height: 5,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderLeftColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
    marginTop: -3,
  },
  doneLabel: { fontFamily: FONT.medium, fontSize: 12, textAlign: 'center', marginTop: 6 },
  error: { fontFamily: FONT.medium, fontSize: 11, textAlign: 'center', marginTop: 6 },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(60,40,30,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: LIGHTBOX_PADDING,
  },
  // width/height arrive once the picture's own aspect ratio is known
  lightboxPhoto: { width: '100%', height: '90%', borderRadius: 16 },
});
