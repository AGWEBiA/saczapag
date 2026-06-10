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
  media_url?: string | null;
  media_type?: string | null;
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
          "id, content, created_at, direction, sender_name, is_internal, evolution_message_id, media_url, media_type, metadata",
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
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 wa-chat-bg">
      <div ref={topSentinelRef} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin wa-meta" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {messages.length === 0 ? (
          <div className="text-center py-8 wa-meta">
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
    isOutbound && !failed && (deliveryStatus === "queued" || deliveryStatus === "sending" || deliveryStatus === "pending");
  const sent = isOutbound && !failed && !sending && (deliveryStatus === "sent" || !!msg.evolution_message_id);
  const delivered = isOutbound && (deliveryStatus === "delivered" || deliveryStatus === "read");
  const read = isOutbound && deliveryStatus === "read";
  const messageTime =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? format(createdAt, "HH:mm", { locale: ptBR })
      : "--:--";
  const visibleDeliveryError =
    deliveryError ||
    (stalePending
      ? "Envio não confirmado pelo WhatsApp. Verifique se a instância está conectada."
      : null);

  if (msg.is_internal) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[85%] bg-yellow-100 border border-yellow-300 text-yellow-900 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Info className="h-3 w-3 text-yellow-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-800">
              Nota Interna {msg.sender_name ? `· ${msg.sender_name}` : ""}
            </span>
          </div>
          {msg.content && (
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          )}
          <div className="text-[10px] text-yellow-700/70 mt-1 text-right">{messageTime}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group/bubble flex w-full", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] lg:max-w-[65%] px-2.5 pt-1.5 pb-1 animate-in fade-in slide-in-from-bottom-1 duration-200",
          isOutbound ? "wa-bubble-out" : "wa-bubble-in",
        )}
      >
        <div className="absolute -top-2 -right-2 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
          <CreateTaskDialog messageId={msg.id} initialContent={msg.content || ""} />
        </div>
        {isGroup && !isOutbound && msg.sender_name && (
          <span className="block text-[12.5px] font-semibold mb-0.5" style={{ color: "#06cf9c" }}>
            {msg.sender_name}
          </span>
        )}
        {msg.media_url && <MediaAttachment url={msg.media_url} type={msg.media_type} />}
        {msg.content && msg.content !== "[Mídia]" && (
          <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words pr-16">
            {msg.content}
          </p>
        )}
        <div className="flex items-center justify-end gap-1 -mt-0.5 ml-2 float-right">
          <span className="text-[11px] wa-meta leading-none">{messageTime}</span>
          {isOutbound && (
            <span
              className="inline-flex items-center leading-none"
              title={visibleDeliveryError ?? (read ? "Lida" : delivered ? "Entregue" : sent ? "Enviada" : sending ? "Enviando" : failed ? "Falha" : "")}
            >
              {failed ? (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              ) : sending ? (
                <Clock className="h-3 w-3 wa-meta" />
              ) : delivered || sent ? (
                <CheckCheck className={cn("h-3.5 w-3.5", read ? "wa-tick" : "wa-meta")} />
              ) : null}
            </span>
          )}
        </div>
        <div className="clear-both" />
        {failed && visibleDeliveryError && (
          <div className="mt-1 text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
            {visibleDeliveryError}
          </div>
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";

function MediaAttachment({ url, type }: { url: string; type?: string | null }) {
  const t = (type || "").toLowerCase();
  const isImage = t.startsWith("image") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
  const isVideo = t.startsWith("video") || /\.(mp4|webm|mov)(\?|$)/i.test(url);
  const isAudio = t.startsWith("audio") || /\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(url);

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1 -mx-1.5 -mt-1">
        <img src={url} alt="mídia" className="rounded-md max-h-80 w-full object-cover" loading="lazy" />
      </a>
    );
  }
  if (isVideo) {
    return <video src={url} controls className="rounded-md max-h-80 mb-1 -mx-1.5 -mt-1 w-full" />;
  }
  if (isAudio) {
    return <audio src={url} controls className="w-full mb-1" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs font-medium underline mb-1 bg-black/5 px-2 py-1.5 rounded"
    >
      📎 Abrir anexo
    </a>
  );
}
