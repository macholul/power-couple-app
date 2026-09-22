import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { characterFor } from '@/lib/characters';
import { genderOf } from '@/lib/people';
import type { Couple, Profile } from '@/lib/types/database';

export interface Viewer {
  userId: string;
  profile: Profile;
  couple: Couple;
  partnerId: string;
  partner: Profile;
}

/**
 * Mirrors what the web app's requireViewer() decided by redirecting. Here the
 * same outcomes are values, so the router can act on them instead.
 */
export type ViewerState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'unpaired'; userId: string; profile: Profile | null }
  | { status: 'paired'; viewer: Viewer }
  /** the first load for this user failed, so nothing about them is known */
  | { status: 'error'; userId: string };

/** Every gated route target, derived purely so it can be tested. */
export type GateTarget = '/login' | '/pairing' | '/' | null;

/**
 * - 'app'     the paired-only screens (home, profile)
 * - 'auth'    login / signup
 * - 'pairing' the invite screen
 * - 'account' settings, for anyone signed in, paired or not
 */
export type GateArea = 'app' | 'auth' | 'pairing' | 'account';

/**
 * Where a viewer in `state` belongs, given the area of the app they are
 * currently looking at. `null` means "stay put".
 */
export function gateTarget(state: ViewerState, area: GateArea): GateTarget {
  // Never route on a half-known state: the session is restored asynchronously
  // and pairing needs a query, so acting early would bounce the user around.
  // A failed load is not an answer either; the gate offers a retry instead.
  if (state.status === 'loading' || state.status === 'error') return null;

  switch (area) {
    case 'app':
      if (state.status === 'signedOut') return '/login';
      if (state.status === 'unpaired') return '/pairing';
      return null;
    case 'auth':
      // already signed in? the app decides where they really belong
      if (state.status === 'paired') return '/';
      if (state.status === 'unpaired') return '/pairing';
      return null;
    case 'pairing':
      if (state.status === 'signedOut') return '/login';
      if (state.status === 'paired') return '/';
      return null;
    case 'account':
      return state.status === 'signedOut' ? '/login' : null;
  }
}

interface ViewerContextValue {
  state: ViewerState;
  /** re-read profile/couple/partner, e.g. right after redeeming an invite */
  refresh: () => Promise<void>;
}

const ViewerContext = createContext<ViewerContextValue>({
  state: { status: 'loading' },
  refresh: async () => {},
});

/** What the last query produced, and for which signed-in user. */
type Fetched = {
  userId: string;
  result: Extract<ViewerState, { status: 'unpaired' | 'paired' | 'error' }>;
};

/** Coming back to the app after this long re-checks the couple. */
const RETURN_STALE_MS = 15_000;

/**
 * The signup trigger creates every profile in the same transaction as the
 * account, so a missing one was deleted by hand. Recreate it from the signup
 * metadata, and only ever create: an update could overwrite a name or gender
 * changed since.
 */
async function healProfile(user: User): Promise<Profile | null> {
  const meta = user.user_metadata ?? {};
  const gender = genderOf({ gender: meta.gender, avatar_character: meta.avatar_character });
  const name = typeof meta.display_name === 'string' ? meta.display_name.trim().slice(0, 30) : '';

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        display_name: name || 'me',
        gender,
        avatar_character: characterFor(meta.avatar_character, gender).key,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (error) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const latestLoad = useRef(0);
  const lastLoadedAt = useRef(0);
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    // "still restoring" and "signed out" are facts about the session, not
    // results of this query, so they are derived below instead of written
    // into state. Pushing them through state would render twice, and would
    // leave the previous user's viewer on screen for a frame after a switch.
    if (authLoading || !user) return;

    // Only the newest load may write: a slow one finishing late would
    // otherwise put back a couple that has since ended, or not yet begun.
    const thisLoad = ++latestLoad.current;
    lastLoadedAt.current = Date.now();
    const settle = (result: Fetched['result']) => {
      if (thisLoad !== latestLoad.current) return;
      // Polling usually finds nothing new; keeping the same object then
      // spares every screen below a re-render.
      setFetched((current) =>
        current?.userId === user.id && JSON.stringify(current.result) === JSON.stringify(result)
          ? current
          : { userId: user.id, result },
      );
    };
    // A dropped connection is not news about the couple. Whatever is already
    // known stays on screen; only a first load with nothing to show errors.
    const fail = () => {
      if (thisLoad !== latestLoad.current) return;
      setFetched((current) =>
        current?.userId === user.id ? current : { userId: user.id, result: { status: 'error', userId: user.id } },
      );
    };

    // profile and couple both depend only on the user id, so fetch in parallel.
    // Ended couples are hidden by row level security, so this is the active one.
    const [profileResult, coupleResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .maybeSingle(),
    ]);
    if (profileResult.error || coupleResult.error) return fail();

    const profile = (profileResult.data as Profile | null) ?? (await healProfile(user));
    if (!profile) return fail();

    const couple = coupleResult.data as Couple | null;
    if (!couple) return settle({ status: 'unpaired', userId: user.id, profile });

    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;
    const partnerResult = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .maybeSingle();
    if (partnerResult.error) return fail();

    // A couple row with an unreadable partner profile is the same dead end the
    // web app treated as "not paired yet".
    if (!partnerResult.data) return settle({ status: 'unpaired', userId: user.id, profile });

    settle({
      status: 'paired',
      viewer: { userId: user.id, profile, couple, partnerId, partner: partnerResult.data as Profile },
    });
  }, [authLoading, user]);

  // Every setState inside load() is behind an await, so nothing here runs
  // synchronously during the effect.
  useEffect(() => {
    void load();
  }, [load]);

  // Pairing and unpairing happen on the other person's phone, so coming back
  // to the app is when this one finds out.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastLoadedAt.current > RETURN_STALE_MS) void load();
    });
    return () => subscription.remove();
  }, [load]);

  let state: ViewerState;
  if (authLoading) state = { status: 'loading' };
  else if (!userId) state = { status: 'signedOut' };
  // a result belonging to a different user is not an answer about this one
  else if (fetched?.userId === userId) state = fetched.result;
  else state = { status: 'loading' };

  return (
    <ViewerContext.Provider value={{ state, refresh: load }}>{children}</ViewerContext.Provider>
  );
}

export function useViewer(): ViewerState {
  return useContext(ViewerContext).state;
}

export function useRefreshViewer(): () => Promise<void> {
  return useContext(ViewerContext).refresh;
}

/** The paired viewer, for screens that only render behind the 'app' gate. */
export function useRequireViewer(): Viewer | null {
  const state = useViewer();
  return state.status === 'paired' ? state.viewer : null;
}
