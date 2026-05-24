import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCheck, Clock, Loader2 } from "lucide-react";

interface MessageListProps {
  conversationId: string;
  isGroup?: boolean;
}

const PAGE_SIZE = 30;

type Msg = {
  id: string;
  content: string | null;
  created_at: string;
  direction: string;
  sender_name: string | null;
  is_internal: boolean | null;
  evolution_message_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MessagesInfiniteData = InfiniteData<Msg[], string | null>;

export function MessageList({ conversationId, isGroup }: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollHeightRef = useRef<number>(0);
  const initialScrollDone = useRef(false);

  const queryKey = useMemo(() => ["messages", conversationId] as const, [conversationId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    staleTime: 1000 * 60 * 30,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("messages")
        .select(
          "id, content, created_at, direction, sender_name, is_internal, evolution_message_id, metadata",
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) {
        q = q.lt("created_at", pageParam);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
  });

  // Mensagens em ordem cronológica
  const messages: Msg[] = data ? data.pages.flat().slice().reverse() : [];

  // Realtime: anexa novas mensagens à primeira "página" sem refetch completo
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Msg;
          queryClient.setQueryData<MessagesInfiniteData>(queryKey, (old) => {
            if (!old) return old;
            const pages = [...old.pages];
            const first = pages[0] ?? [];
            // first page é DESC: prepend
            if (first.some((m: Msg) => m.id === newMsg.id)) return old;
            pages[0] = [newMsg, ...first];
            return { ...old, pages };
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Msg;
          queryClient.setQueryData<MessagesInfiniteData>(queryKey, (old) => {
            if (!old) return old;
            const pages = old.pages.map((page: Msg[]) =>
              page.map((msg) => (msg.id === updatedMsg.id ? updatedMsg : msg)),
            );
            return { ...old, pages };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, queryKey]);

  // IntersectionObserver no topo: dispara fetchNextPage
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          initialScrollDone.current
        ) {
          lastScrollHeightRef.current = container.scrollHeight;
          fetchNextPage();
        }
      },
      { root: container, rootMargin: "100px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Mantém scroll position ao prepender mensagens antigas
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (lastScrollHeightRef.current > 0) {
      const diff = container.scrollHeight - lastScrollHeightRef.current;
      container.scrollTop = diff;
      lastScrollHeightRef.current = 0;
    }
  }, [data?.pages.length]);

  // Scroll inicial e ao receber nova mensagem
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;
    if (!initialScrollDone.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDone.current = true;
      return;
    }
    // Se está perto do fim, faz auto-scroll
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (nearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  // Reset ao trocar de conversa
  useEffect(() => {
    initialScrollDone.current = false;
    lastScrollHeightRef.current = 0;
  }, [conversationId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 bg-muted/30">
      <div ref={topSentinelRef} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Inicie a conversa enviando uma mensagem.
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} isGroup={isGroup} />)
        )}
      </div>
    </div>
  );
}

import * as React from "react";

const MessageBubble = React.memo(({ msg, isGroup }: { msg: Msg; isGroup?: boolean }) => {
  const deliveryStatus = msg.metadata?.delivery_status as string | undefined;
  const deliveryError = msg.metadata?.error as string | undefined;
  const isOutbound = msg.direction === "outbound" && !msg.is_internal;
  const failed = isOutbound && deliveryStatus === "failed";
  const sending = isOutbound && (deliveryStatus === "queued" || deliveryStatus === "sending");
  const sent = isOutbound && (deliveryStatus === "sent" || !!msg.evolution_message_id);

  return (
    <div
      className={cn(
        "flex flex-col max-w-[80%] rounded-lg p-3",
        msg.is_internal
          ? "bg-yellow-50 border-yellow-200 self-center max-w-[90%] w-full border text-yellow-900"
          : msg.direction === "outbound"
            ? "bg-primary text-primary-foreground self-end rounded-tr-none"
            : "bg-card self-start rounded-tl-none border",
      )}
    >
      {msg.is_internal && (
        <span className="text-[10px] font-bold uppercase mb-1 text-yellow-700">Nota Interna</span>
      )}
      {isGroup && msg.direction === "inbound" && msg.sender_name && (
        <span className="text-[10px] font-bold mb-1 text-primary">{msg.sender_name}</span>
      )}
      {msg.direction === "outbound" && msg.sender_name && (
        <span className="text-[10px] font-bold mb-1 text-primary-foreground opacity-90">
          {msg.sender_name}
        </span>
      )}
      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span
          className={cn(
            "text-[10px] opacity-70",
            msg.is_internal
              ? "text-yellow-600"
              : msg.direction === "outbound"
                ? "text-primary-foreground"
                : "text-muted-foreground",
          )}
        >
          {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
        </span>
        {isOutbound && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] opacity-80",
              failed && "text-destructive opacity-100",
              !failed && "text-primary-foreground",
            )}
            title={deliveryError}
          >
            {failed ? (
              <>
                <AlertTriangle className="h-3 w-3" /> falhou
              </>
            ) : sending ? (
              <>
                <Clock className="h-3 w-3" /> enviando
              </>
            ) : sent ? (
              <>
                <CheckCheck className="h-3 w-3" /> enviado
              </>
            ) : null}
          </span>
        )}
      </div>
      {failed && deliveryError && (
        <span className="mt-1 text-[10px] leading-snug text-destructive">{deliveryError}</span>
      )}
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
