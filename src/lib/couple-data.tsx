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

import { supabase } from '@/lib/supabase';
import { toDateKey } from '@/lib/dates';
import { useRefreshViewer, useViewer } from '@/lib/viewer';
import { deviceTimeZone } from '@/lib/actions/auth';
import { recordToday, syncTimezone } from '@/lib/actions/profile';
import type {
  DaySchedule,
  LoveNote,
  Task,
  TaskCompletion,
} from '@/lib/types/database';

export interface CoupleData {
  tasks: Task[];
  completions: TaskCompletion[];
  notes: LoveNote[];
  daySchedules: DaySchedule[];
  /** true only until the first load lands; refreshes are silent */
  loading: boolean;
}

const EMPTY: CoupleData = {
  tasks: [],
  completions: [],
  notes: [],
  daySchedules: [],
  loading: true,
};

interface CoupleDataContextValue extends CoupleData {
  refresh: () => Promise<void>;
}

const CoupleDataContext = createContext<CoupleDataContextValue>({
  ...EMPTY,
  refresh: async () => {},
});

// AutoRefresh's thresholds, carried over verbatim
const RETURN_STALE_MS = 15_000;
const TICK_STALE_MS = 55_000;
const TICK_INTERVAL_MS = 60_000;

/**
 * Replaces three separate pieces of the web app at once.
 *
 *  - The server components' `await supabase.from(...)` fetches. Those re-ran
 *    on every request; here the data is state, and every mutation ends by
 *    calling `refresh()` where the web called `revalidatePath('/')`.
 *  - components/AutoRefresh.tsx. `document.visibilitychange` becomes
 *    AppState, with the same two staleness thresholds, so the panels still
 *    roll over to a new day on their own.
 *  - components/DayRecorder.tsx and components/TimezoneSync.tsx, which were
 *    invisible components mounted by both pages. Mounting them once here is
 *    equivalent and avoids the duplicate RPC the web fired on navigation.
 */
export function CoupleDataProvider({ children }: { children: ReactNode }) {
  const viewerState = useViewer();
  const refreshViewer = useRefreshViewer();
  const [data, setData] = useState<CoupleData>(EMPTY);
  const lastRefresh = useRef(0);

  const paired = viewerState.status === 'paired';
  const storedTimeZone = paired ? viewerState.viewer.profile.timezone : null;

  const refresh = useCallback(async () => {
    if (!paired) return;
    lastRefresh.current = Date.now();

    // The web bounded these queries at a year for the same reason: the streak
    // walk never looks further back than MAX_LOOKBACK_DAYS.
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const since = toDateKey(yearAgo);

    const [tasks, completions, notes, daySchedules] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at'),
      supabase.from('task_completions').select('*').gte('scheduled_date', since),
      supabase
        .from('love_notes')
        .select('*')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('day_schedules').select('*').gte('date_key', since),
    ]);

    setData({
      tasks: (tasks.data ?? []) as Task[],
      completions: (completions.data ?? []) as TaskCompletion[],
      notes: (notes.data ?? []) as LoveNote[],
      daySchedules: (daySchedules.data ?? []) as DaySchedule[],
      loading: false,
    });
  }, [paired]);

  useEffect(() => {
    // Every setState inside refresh() is behind an await, so nothing here runs
    // synchronously during the effect. The rule cannot see that, and this is
    // the "subscribe to an external system" case its own message describes as
    // the correct use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // DayRecorder: freeze today's schedule on open and on every return
  useEffect(() => {
    if (!paired) return;
    void recordToday();
  }, [paired]);

  // TimezoneSync: keep the profile's zone matching the device's
  useEffect(() => {
    if (!paired) return;
    const detected = deviceTimeZone();
    if (detected === storedTimeZone) return;
    void syncTimezone(detected).then((changed) => {
      // re-read the viewer so the corrected day shows on this visit, not the
      // next one — the web got this from router.refresh()
      if (changed) void refreshViewer();
    });
  }, [paired, storedTimeZone, refreshViewer]);

  // AutoRefresh
  useEffect(() => {
    if (!paired) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void recordToday();
      if (Date.now() - lastRefresh.current > RETURN_STALE_MS) void refresh();
    });

    const timer = setInterval(() => {
      if (
        AppState.currentState === 'active' &&
        Date.now() - lastRefresh.current > TICK_STALE_MS
      ) {
        void refresh();
      }
    }, TICK_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [paired, refresh]);

  return (
    <CoupleDataContext.Provider value={{ ...data, refresh }}>
      {children}
    </CoupleDataContext.Provider>
  );
}

export function useCoupleData(): CoupleDataContextValue {
  return useContext(CoupleDataContext);
}
