import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";

interface MessageListProps {
  conversationId: string;
}

export function MessageList({ conversationId }: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 p-4 bg-muted/30">
      <div className="flex flex-col gap-4">
        {messages?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Inicie a conversa enviando uma mensagem.
          </div>
        ) : (
          messages?.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[80%] rounded-lg p-3",
                msg.direction === "outbound"
                  ? "bg-primary text-primary-foreground self-end rounded-tr-none"
                  : "bg-card self-start rounded-tl-none border"
              )}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              <span className={cn(
                "text-[10px] mt-1 self-end opacity-70",
                msg.direction === "outbound" ? "text-primary-foreground" : "text-muted-foreground"
              )}>
                {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
              </span>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
