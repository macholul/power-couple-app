import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
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
 * same three outcomes are values, so the router can act on them instead.
 */
export type ViewerState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'unpaired'; userId: string; profile: Profile | null }
  | { status: 'paired'; viewer: Viewer };

/** Every gated route target, derived purely so it can be tested. */
export type GateTarget = '/login' | '/pairing' | '/' | null;

/**
 * Where a viewer in `state` belongs, given the area of the app they are
 * currently looking at. `null` means "stay put".
 *
 * - 'app'     the paired-only screens (home, profile)
 * - 'auth'    login / signup
 * - 'pairing' the invite screen
 */
export function gateTarget(state: ViewerState, area: 'app' | 'auth' | 'pairing'): GateTarget {
  // Never route on a half-known state: the session is restored asynchronously
  // and pairing needs a query, so acting early would bounce the user around.
  if (state.status === 'loading') return null;

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

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<ViewerState>({ status: 'loading' });

  const load = useCallback(async () => {
    if (authLoading) {
      setState({ status: 'loading' });
      return;
    }
    if (!user) {
      setState({ status: 'signedOut' });
      return;
    }

    // profile and couple both depend only on the user id, so fetch in parallel
    const [{ data: profileRow }, { data: couple }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
        .from('couples')
        .select('*')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .maybeSingle(),
    ]);

    let profile = profileRow as Profile | null;
    if (!profile) {
      // Signup stores these in auth metadata; heal the profile row if the
      // original insert was interrupted.
      const meta = user.user_metadata ?? {};
      const { data: created } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: (meta.display_name as string) || 'me',
          avatar_character: meta.avatar_character === 'baris' ? 'baris' : 'mae',
        })
        .select('*')
        .maybeSingle();
      profile = created as Profile | null;
    }

    if (!couple || !profile) {
      setState({ status: 'unpaired', userId: user.id, profile });
      return;
    }

    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;
    const { data: partner } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .maybeSingle();

    // A couple row with an unreadable partner profile is the same dead end the
    // web app treated as "not paired yet".
    if (!partner) {
      setState({ status: 'unpaired', userId: user.id, profile });
      return;
    }

    setState({
      status: 'paired',
      viewer: { userId: user.id, profile, couple, partnerId, partner: partner as Profile },
    });
  }, [authLoading, user]);

  useEffect(() => {
    void load();
  }, [load]);

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
