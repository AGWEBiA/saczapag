import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export function MentionNotificationHandler() {
  const { user } = useAuth();
  
  const { data: profile } = useQuery({
    queryKey: ["current_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user || !profile) return;

    const channel = supabase
      .channel("mentions-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "direction=eq.inbound",
        },
        async (payload) => {
          const newMessage = payload.new as any;
          const content = newMessage.content || "";
          
          // Enhanced mention detection
          const userIdentifier = user.email?.split("@")[0] || "";
          const fullName = profile.full_name || "";
          const firstName = fullName.split(" ")[0];

          const mentions = [
            `@${userIdentifier.toLowerCase()}`,
            `@${firstName.toLowerCase()}`,
            `@${fullName.toLowerCase().replace(/\s/g, "")}`,
          ];

          const isMentioned = mentions.some(m => content.toLowerCase().includes(m));
          
          if (isMentioned) {
            // Create notification record
            const { error } = await supabase.from("notifications" as any).insert({
              user_id: user.id,
              title: "Você foi citado!",
              content: content.substring(0, 100),
              type: "mention",
              link: `/chat?id=${newMessage.conversation_id}`,
              read: false,
            } as any);

            if (!error) {
              toast.info("Você foi citado em uma conversa!", {
                description: content.substring(0, 50) + "...",
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  return null;
}
