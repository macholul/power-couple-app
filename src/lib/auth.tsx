import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** true until the persisted session has been read off disk */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
});

/**
 * Holds the auth session for the whole app.
 *
 * On the web this job was split across proxy.ts (refresh the cookie on every
 * request) and a getUser() call inside each server component. Here the session
 * lives in memory, is restored from encrypted storage once at startup, and
 * every later change — sign in, sign out, token refresh — arrives through
 * onAuthStateChange.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restoring the session is async (Keychain read + AES decrypt), so the app
    // must not decide "signed out" before this resolves — that would flash the
    // login screen at every cold start.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
