import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const instancesQueryOptions = queryOptions({
  queryKey: ["whatsapp_instances", "list"],
  staleTime: 1000 * 60 * 5,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("id, name, evolution_instance_name, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});
