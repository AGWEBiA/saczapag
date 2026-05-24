import { createServerFn } from "@tanstack/react-start";
import { syncGroupsServer } from "./sync-groups.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: string) => data)
  .handler(async ({ data }) => {
    return await syncGroupsServer(data);
  });
