import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

const BUCKET = 'completion-photos';
const MAX_PHOTO_EDGE = 600;

/**
 * Downscale to <=600px and re-encode as JPEG q0.8 — the same budget the web's
 * `shrinkPhoto()` enforced with a canvas.
 *
 * SDK 57 replaced `manipulateAsync()` with a context object: build up the
 * operations, `renderAsync()` to rasterise, then `saveAsync()` to encode. The
 * hook form (`useImageManipulator`) is fixed to one URI at mount, so the
 * class form is the right one here — the URI arrives from the picker.
 *
 * base64 is requested because that is what the upload needs (see below), so
 * the bytes never touch the filesystem a second time.
 */
export async function shrinkPhoto(
  uri: string,
  width: number,
  height: number,
): Promise<{ uri: string; bytes: Uint8Array }> {
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height));
  const context = ImageManipulator.manipulate(uri);
  if (scale < 1) {
    context.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.8,
    base64: true,
  });
  if (!result.base64) throw new Error('could not process photo');
  return { uri: result.uri, bytes: decodeBase64(result.base64) };
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * supabase-js uploads a Blob or File on the web. Neither is backed by real
 * bytes in React Native — a Blob here is a handle into native memory that
 * fetch cannot serialise — so the documented React Native path is to hand it
 * an ArrayBuffer instead. Written out rather than pulling in a dependency:
 * adding one would mean a native rebuild for 20 lines of arithmetic.
 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let byte = 0;
  let bits = 0;
  let out = 0;

  for (let index = 0; index < clean.length; index += 1) {
    byte = (byte << 6) | B64_ALPHABET.indexOf(clean[index]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (byte >> bits) & 0xff;
      out += 1;
    }
  }
  return bytes.subarray(0, out);
}

/** Port of lib/supabase/storage.ts. The RLS policy on storage.objects checks
 *  that the first path segment is the caller's couple id. */
export async function uploadCompletionPhoto(
  coupleId: string,
  taskId: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = `${coupleId}/${taskId}/${randomId()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes as unknown as ArrayBuffer, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

function randomId(): string {
  // react-native-get-random-values is imported by lib/supabase, so
  // crypto.randomUUID's underlying entropy source exists by the time any of
  // this runs. Hermes still has no randomUUID itself, hence the manual build.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The web served photos from `/photos/[completionId]`: a stable URL the
 * browser could cache, backed by a route handler that downloaded through the
 * caller's session. There is no server here, so the device signs its own URL.
 *
 * Signed URLs carry a fresh token every time they are minted, and a changed
 * URL is a cache miss for expo-image — which is exactly the white flash the
 * web went out of its way to avoid. So they are cached by storage path and
 * reused until shortly before they expire.
 */
const TTL_SECONDS = 60 * 60;
const REUSE_MARGIN_MS = 5 * 60 * 1000;

const signedUrls = new Map<string, { url: string; expiresAt: number }>();

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const cached = signedUrls.get(path);
  if (cached && cached.expiresAt - REUSE_MARGIN_MS > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, TTL_SECONDS);
  if (error || !data) return null;

  signedUrls.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}
