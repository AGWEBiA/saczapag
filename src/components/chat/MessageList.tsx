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
  isGroup?: boolean;
}

export function MessageList({ conversationId, isGroup }: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    staleTime: 1000 * 60 * 30, // 30 minutos (mensagens passadas não mudam)
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, created_at, direction, sender_name, is_internal")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }) // Buscar as últimas primeiro
        .limit(50);

      if (error) throw error;
      return data?.reverse(); // Reverter para exibir na ordem correta
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

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
            <MessageBubble key={msg.id} msg={msg} isGroup={isGroup} />
          ))
        )}
      </div>
    </ScrollArea>
  );
}

import * as React from "react";

const MessageBubble = React.memo(({ msg, isGroup }: { msg: any, isGroup?: boolean }) => {
  return (
    <div
      className={cn(
        "flex flex-col max-w-[80%] rounded-lg p-3",
        msg.is_internal 
          ? "bg-yellow-50 border-yellow-200 self-center max-w-[90%] w-full border text-yellow-900" 
          : msg.direction === "outbound"
            ? "bg-primary text-primary-foreground self-end rounded-tr-none"
            : "bg-card self-start rounded-tl-none border"
      )}
    >
      {msg.is_internal && (
        <span className="text-[10px] font-bold uppercase mb-1 text-yellow-700">Nota Interna</span>
      )}
      {isGroup && msg.direction === "inbound" && msg.sender_name && (
        <span className="text-[10px] font-bold mb-1 text-primary">{msg.sender_name}</span>
      )}
      {msg.direction === "outbound" && msg.sender_name && (
        <span className="text-[10px] font-bold mb-1 text-primary-foreground opacity-90">{msg.sender_name}</span>
      )}
      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className={cn(
          "text-[10px] opacity-70",
          msg.is_internal ? "text-yellow-600" : msg.direction === "outbound" ? "text-primary-foreground" : "text-muted-foreground"
        )}>
          {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
        </span>
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
