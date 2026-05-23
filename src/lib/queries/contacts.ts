import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const contactsQueryOptions = queryOptions({
  queryKey: ["contacts", "list"],
  staleTime: 1000 * 60 * 5,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone_number, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  },
});
