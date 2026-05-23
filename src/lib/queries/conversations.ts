import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const conversationsListQueryOptions = queryOptions({
  queryKey: ["conversations", "all", ""],
  staleTime: 1000 * 30,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select(
        `id, status, assigned_to, last_message_at, last_message_content, unread_count, is_group,
         contact:contacts(id, name, phone_number, avatar_url)`,
      )
      .order("last_message_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  },
});
