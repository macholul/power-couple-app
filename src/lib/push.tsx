import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

/**
 * The phone's half of push notifications. The database decides what to send
 * (migration 20261030000000) and the `push` Edge Function sends it; this file
 * only ever does four things:
 *
 *   - asks iOS for permission, when the person asks for it and not before;
 *   - tells the database which phone to notify, and tells it to forget the
 *     phone on the way out;
 *   - opens the home screen when a notification is tapped;
 *   - nudges the function to send now, so a partner's phone buzzes while they
 *     are still looking at it rather than at the next scheduled tick.
 */

export type PushState =
  /** the permission has not been read yet */
  | 'unknown'
  /** not a phone, or a build without notification support */
  | 'unsupported'
  /** iOS has never been asked */
  | 'undetermined'
  /** asked and refused: only the Settings app can change this now */
  | 'denied'
  | 'granted';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

// Without a handler, a notification that arrives while the app is open is
// dropped silently. Badges are deliberately left alone: nothing ever sets a
// number, so the app never asks for permission to.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * The token this phone is registered under, kept so signing out can hand it
 * back. It belongs to the device rather than to any screen, which is why it
 * is not state.
 */
let registeredToken: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Called when a notification arrives or is tapped. The couple's data is
 * usually about to change, so whoever is holding it reloads.
 */
export function addPushListener(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const announce = () => listeners.forEach((listener) => listener());

/**
 * Asks the push function to send what is queued, without waiting for it.
 *
 * The queue drains on a schedule anyway, so this only buys speed, and a
 * failure means a notification arrives a few minutes later instead of never.
 * Nothing about the notification comes from here: the database already
 * decided who hears about what.
 */
export function flushPush(): void {
  if (!supported) return;
  void supabase.functions.invoke('push', { body: {} });
}

/** iOS's answer, in the three states the app actually treats differently. */
function describe(settings: Notifications.NotificationPermissionsStatus): PushState {
  // Provisional authorisation delivers quietly without ever asking, which is
  // still delivery as far as the app is concerned.
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return settings.status === 'undetermined' ? 'undetermined' : 'denied';
}

/**
 * This phone's Expo push token, or null if it cannot have one: no project id,
 * a build without push credentials, or simply no network, since Expo issues
 * the token over the internet.
 */
async function tokenForThisPhone(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || !projectId) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Stops notifications reaching a phone its owner has just signed out of.
 * Called before the session goes, because the delete needs it.
 */
export async function forgetThisDevice(): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  await supabase.rpc('forget_push_device', { p_token: token });
}

interface PushContextValue {
  state: PushState;
  /** Asks iOS, once. Returns what it said, so a screen can react in place. */
  enable: () => Promise<PushState>;
}

const PushContext = createContext<PushContextValue>({
  state: 'unknown',
  enable: async () => 'unsupported',
});

export function PushProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>(supported ? 'unknown' : 'unsupported');
  const registeredFor = useRef<string | null>(null);

  const read = useCallback(async () => {
    if (!supported) return;
    const settings = await Notifications.getPermissionsAsync();
    setState(describe(settings));
  }, []);

  const enable = useCallback(async (): Promise<PushState> => {
    if (!supported) return 'unsupported';
    // Badges and alerts are asked for separately on iOS; nothing here sets a
    // badge, so asking for one would be asking for a permission never used.
    const settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    const next = describe(settings);
    setState(next);
    return next;
  }, []);

  // Every setState below sits behind an await, so none of it runs while the
  // effect itself is running.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read();
  }, [read]);

  // Permission can be revoked in the Settings app while the app is in the
  // background, and nothing tells the app but coming back.
  useEffect(() => {
    if (!supported) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void read();
    });
    return () => subscription.remove();
  }, [read]);

  // Who to notify. The token is re-registered for each person who signs in on
  // this phone, which is also what moves it off the person who signed out.
  useEffect(() => {
    if (!supported || !user || state !== 'granted') return;
    if (registeredFor.current === user.id) return;

    let active = true;
    void (async () => {
      const token = await tokenForThisPhone();
      if (!active || !token) return;
      const { error } = await supabase.rpc('register_push_device', {
        p_token: token,
        p_platform: Platform.OS === 'android' ? 'android' : 'ios',
      });
      if (active && !error) {
        registeredToken = token;
        registeredFor.current = user.id;
      }
    })();
    return () => {
      active = false;
    };
  }, [user, state]);

  // A signed-out phone has nothing to register, and a new sign-in registers
  // again rather than trusting what the last one left behind.
  useEffect(() => {
    if (!user) registeredFor.current = null;
  }, [user]);

  useEffect(() => {
    if (!supported) return;

    const received = Notifications.addNotificationReceivedListener(() => announce());
    const tapped = Notifications.addNotificationResponseReceivedListener(() => {
      announce();
      // Every notification is about the home screen: a proof to confirm, a
      // confirmation, a note, or goals left today. The gate sends anyone who
      // is signed out or unpaired somewhere more useful.
      router.navigate('/');
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, []);

  return <PushContext.Provider value={{ state, enable }}>{children}</PushContext.Provider>;
}

export function usePush(): PushContextValue {
  return useContext(PushContext);
}
