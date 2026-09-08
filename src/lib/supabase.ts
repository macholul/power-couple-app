// Polyfill must come before anything touches crypto.getRandomValues — Hermes
// has no Web Crypto, and LargeSecureStore below needs it to make AES keys.
import 'react-native-get-random-values';

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at import time: a missing env var otherwise surfaces as a
  // confusing "Invalid URL" deep inside the first query.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and restart Metro with --clear.',
  );
}

/**
 * Session storage for React Native.
 *
 * The web app kept the session in HTTP cookies (@supabase/ssr) and refreshed
 * them in proxy.ts on every request. There are no cookies here, so the session
 * has to live on the device.
 *
 * SecureStore (iOS Keychain / Android Keystore) is the right home for it, but
 * it caps values at 2048 bytes and a Supabase session (access token, refresh
 * token, and the whole user object) can exceed that. So: encrypt the session
 * with a random AES key, keep the *key* in SecureStore, and park the
 * ciphertext in AsyncStorage, which has no size limit. This is the pattern
 * Supabase documents for Expo.
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      // Keychain entry gone (app reinstalled, keychain reset) while the
      // ciphertext survived. Treat as "no session" rather than crashing.
      await this.removeItem(key);
      return null;
    }
  }

  async setItem(key: string, value: string) {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based auth callbacks on a phone; leaving this on makes supabase-js
    // reach for window.location, which does not exist here.
    detectSessionInUrl: false,
  },
});

/**
 * The web app refreshed the access token on every server request. A phone app
 * gets suspended instead, so refresh is tied to foreground state: run the
 * timer while the app is visible, stop it when backgrounded (the OS would
 * freeze it anyway, and a stopped timer avoids a burst of failed refreshes on
 * resume).
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
