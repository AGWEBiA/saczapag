import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "admin" | "supervisor" | "atendente";

export function useUserRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setIsLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (mounted) {
        setRoles((data?.map((r) => r.role as AppRole)) ?? []);
        setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  const isAdmin = roles.includes("admin");
  const isSupervisor = roles.includes("supervisor");

  return { roles, isAdmin, isSupervisor, isLoading };
}
