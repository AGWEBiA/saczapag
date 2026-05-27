import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCheck, Clock, Loader2, Info } from "lucide-react";

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
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 bg-muted/30">
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
import { CreateTaskDialog } from "./CreateTaskDialog";

const MessageBubble = React.memo(({ msg, isGroup }: { msg: Msg; isGroup?: boolean }) => {
  const deliveryStatus = msg.metadata?.delivery_status as string | undefined;
  const deliveryError = msg.metadata?.error as string | undefined;
  const isOutbound = msg.direction === "outbound" && !msg.is_internal;
  const createdAt = msg.created_at ? new Date(msg.created_at) : null;
  const minutesSinceCreated =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? (Date.now() - createdAt.getTime()) / 60000
      : 0;
  const stalePending =
    isOutbound &&
    !msg.evolution_message_id &&
    (deliveryStatus === "queued" || deliveryStatus === "sending") &&
    minutesSinceCreated > 2;
  const failed = isOutbound && (deliveryStatus === "failed" || stalePending);
  const sending =
    isOutbound && !failed && (deliveryStatus === "queued" || deliveryStatus === "sending");
  const sent = isOutbound && (deliveryStatus === "sent" || !!msg.evolution_message_id);
  const messageTime =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? format(createdAt, "HH:mm", { locale: ptBR })
      : "--:--";
  const visibleDeliveryError =
    deliveryError ||
    (stalePending
      ? "Envio não confirmado pelo WhatsApp. Verifique se a instância está conectada."
      : null);

  return (
    <div className="group/bubble flex flex-col items-start w-full">
        <div
        className={cn(
          "flex flex-col max-w-[85%] lg:max-w-[75%] rounded-3xl p-4 lg:p-5 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-500 relative",
          msg.is_internal
            ? "bg-yellow-50/90 border-yellow-200/50 self-center max-w-[95%] w-full border text-yellow-900 backdrop-blur-md mb-6 shadow-lg shadow-yellow-500/5"
            : msg.direction === "outbound"
              ? "bg-primary text-primary-foreground self-end rounded-tr-none shadow-lg shadow-primary/20 ring-1 ring-white/10"
              : "bg-card self-start rounded-tl-none border-border/40 border shadow-xl shadow-black/5 ring-1 ring-black/5",
        )}
      >
        <div className="absolute top-2 right-2 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          <CreateTaskDialog messageId={msg.id} initialContent={msg.content || ""} />
        </div>
        {msg.is_internal && (
          <div className="flex items-center gap-1.5 mb-2 border-b border-yellow-200/50 pb-1">
            <Info className="h-3 w-3 text-yellow-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-700">
              Nota Interna
            </span>
          </div>
        )}
        {isGroup && msg.direction === "inbound" && msg.sender_name && (
          <span className="text-[10px] font-black mb-1.5 text-primary tracking-wide uppercase">
            {msg.sender_name}
          </span>
        )}
        {msg.direction === "outbound" && msg.sender_name && (
          <span className="text-[10px] font-black mb-1.5 text-primary-foreground/80 tracking-wide uppercase">
            {msg.sender_name}
          </span>
        )}
        <p className="text-sm lg:text-[15px] leading-relaxed whitespace-pre-wrap break-words font-medium">
          {msg.content}
        </p>
        <div className="flex items-center justify-between gap-3 mt-2 pt-1 border-t border-current/5">
          <span
            className={cn(
              "text-[10px] font-bold opacity-60",
              msg.is_internal
                ? "text-yellow-600"
                : msg.direction === "outbound"
                  ? "text-primary-foreground"
                  : "text-muted-foreground",
            )}
          >
            {messageTime}
          </span>
          {isOutbound && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter opacity-80",
                failed && "text-red-200 opacity-100",
                !failed && "text-primary-foreground",
              )}
              title={visibleDeliveryError ?? undefined}
            >
              {failed ? (
                <>
                  <AlertTriangle className="h-3 w-3" /> Erro
                </>
              ) : sending ? (
                <>
                  <Clock className="h-3 w-3 animate-pulse" /> Pendente
                </>
              ) : sent ? (
                <>
                  <CheckCheck className="h-3 w-3" /> Enviado
                </>
              ) : null}
            </span>
          )}
        </div>
        {failed && visibleDeliveryError && (
          <span className="mt-2 text-[10px] leading-tight text-red-100 bg-red-900/20 p-2 rounded-lg font-medium border border-red-500/20">
            {visibleDeliveryError}
          </span>
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
