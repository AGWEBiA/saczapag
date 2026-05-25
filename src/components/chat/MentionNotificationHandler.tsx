import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function MentionNotificationHandler() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

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
          
          // Check for @mentions or keywords related to the user
          // For simplicity, we check if the user's email or name is in the content
          // In a real scenario, this would be a proper @user_id mention
          const userIdentifier = user.email?.split("@")[0] || "";
          
          if (content.toLowerCase().includes(`@${userIdentifier.toLowerCase()}`)) {
            // Create notification record
            await supabase.from("notifications" as any).insert({
              user_id: user.id,
              title: "Você foi citado!",
              content: content.substring(0, 100),
              type: "mention",
              link: `/chat?id=${newMessage.conversation_id}`,
            } as any);

            toast.info("Você foi citado em uma conversa!", {
              description: content.substring(0, 50) + "...",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
