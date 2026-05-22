import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AuthState = {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    let mounted = true;

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setState({
          user: session?.user ?? null,
          session: session,
          isAuthenticated: !!session,
          isLoading: false,
        });
      }
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setState((prev) => {
            // Evitar atualizações de estado se nada mudou
            if (prev.session?.access_token === session?.access_token && prev.isLoading === false) {
              return prev;
            }
            return {
              user: session?.user ?? null,
              session: session,
              isAuthenticated: !!session,
              isLoading: false,
            };
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
};
