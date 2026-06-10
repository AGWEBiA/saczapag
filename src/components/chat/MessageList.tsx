import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCheck,
  Clock,
  Loader2,
  Info,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  FileText,
  Play,
  Pause,
  Mic,
  Reply,
  SmilePlus,
  ZoomIn,
  ZoomOut,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { reactMessage as reactMessageFn } from "@/lib/react-message.functions";
import { toast } from "sonner";

type ReplyTarget = {
  id: string;
  evolutionMessageId: string | null;
  sender: string;
  content: string;
};

interface MessageListProps {
  conversationId: string;
  isGroup?: boolean;
  onReply?: (target: ReplyTarget) => void;
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
  metadata?: Record<string, any> | null;
};

type MessagesInfiniteData = InfiniteData<Msg[], string | null>;

export function MessageList({ conversationId, isGroup, onReply }: MessageListProps) {
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollHeightRef = useRef<number>(0);
  const initialScrollDone = useRef(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);

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

      if (pageParam) q = q.lt("created_at", pageParam);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at;
    },
  });

  const messages: Msg[] = data ? data.pages.flat().slice().reverse() : [];

  // Realtime
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

  // Paginação por scroll
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

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (lastScrollHeightRef.current > 0) {
      const diff = container.scrollHeight - lastScrollHeightRef.current;
      container.scrollTop = diff;
      lastScrollHeightRef.current = 0;
    }
  }, [data?.pages.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;
    if (!initialScrollDone.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDone.current = true;
      return;
    }
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    initialScrollDone.current = false;
    lastScrollHeightRef.current = 0;
    setSearchOpen(false);
    setSearchTerm("");
  }, [conversationId]);

  // Matches da busca
  const matchIds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [] as string[];
    return messages.filter((m) => (m.content || "").toLowerCase().includes(term)).map((m) => m.id);
  }, [messages, searchTerm]);

  useEffect(() => {
    setMatchIdx(0);
  }, [searchTerm]);

  useEffect(() => {
    if (!matchIds.length) return;
    const id = matchIds[matchIds.length - 1 - matchIdx]; // mais recente primeiro
    const el = document.getElementById(`msg-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [matchIdx, matchIds]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeMatchId = matchIds.length ? matchIds[matchIds.length - 1 - matchIdx] : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-card/40">
        {searchOpen ? (
          <div className="flex items-center gap-2 w-full">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar nesta conversa..."
              className="h-7 text-xs border-none bg-transparent focus-visible:ring-0 px-0"
            />
            {searchTerm && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {matchIds.length ? `${matchIdx + 1}/${matchIds.length}` : "0/0"}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!matchIds.length}
              onClick={() => setMatchIdx((i) => (i + 1) % matchIds.length)}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={!matchIds.length}
              onClick={() =>
                setMatchIdx((i) => (i - 1 + matchIds.length) % matchIds.length)
              }
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setSearchOpen(false);
                setSearchTerm("");
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <span className="text-[11px] text-muted-foreground">
              {messages.length} mensagens carregadas
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-3 w-3" />
              Buscar
            </Button>
          </>
        )}
      </div>

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
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isGroup={isGroup}
                highlight={searchTerm.trim().toLowerCase()}
                isActiveMatch={msg.id === activeMatchId}
                conversationId={conversationId}
                onReply={onReply}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import * as React from "react";
import { CreateTaskDialog } from "./CreateTaskDialog";

function highlightText(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(term, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={idx}
        className="bg-yellow-300 text-yellow-900 rounded px-0.5"
      >
        {text.slice(idx, idx + term.length)}
      </mark>,
    );
    i = idx + term.length;
  }
  return parts;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const MessageBubble = React.memo(
  ({
    msg,
    isGroup,
    highlight,
    isActiveMatch,
    conversationId,
    onReply,
  }: {
    msg: Msg;
    isGroup?: boolean;
    highlight?: string;
    isActiveMatch?: boolean;
    conversationId: string;
    onReply?: (target: ReplyTarget) => void;
  }) => {
    const reactMessage = useServerFn(reactMessageFn);
    const [reactPopoverOpen, setReactPopoverOpen] = React.useState(false);
    const reactions = Array.isArray(msg.metadata?.reactions)
      ? (msg.metadata!.reactions as Array<{ by: string; emoji: string }>)
      : [];
    const reactionGroups = React.useMemo(() => {
      const map = new Map<string, number>();
      for (const r of reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
      return Array.from(map.entries());
    }, [reactions]);

    const handleReact = async (emoji: string) => {
      setReactPopoverOpen(false);
      if (!msg.evolution_message_id) {
        toast.error("Não é possível reagir a esta mensagem ainda.");
        return;
      }
      try {
        await reactMessage({
          data: {
            conversationId,
            evolutionMessageId: msg.evolution_message_id,
            emoji,
          },
        });
      } catch (e: any) {
        toast.error("Falha ao reagir: " + (e?.message || String(e)));
      }
    };

    const deliveryStatus = msg.metadata?.delivery_status as string | undefined;
    const deliveryError = msg.metadata?.error as string | undefined;
    const quoted = msg.metadata?.quoted as
      | { sender?: string; content?: string }
      | undefined;
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
      isOutbound &&
      !failed &&
      (deliveryStatus === "queued" ||
        deliveryStatus === "sending" ||
        deliveryStatus === "pending");
    const sent =
      isOutbound &&
      !failed &&
      !sending &&
      (deliveryStatus === "sent" || !!msg.evolution_message_id);
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
        <div id={`msg-${msg.id}`} className="flex justify-center my-2">
          <div className="max-w-[85%] bg-yellow-100 border border-yellow-300 text-yellow-900 rounded-lg px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="h-3 w-3 text-yellow-700" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-800">
                Nota Interna {msg.sender_name ? `· ${msg.sender_name}` : ""}
              </span>
            </div>
            {msg.content && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {highlight ? highlightText(msg.content, highlight) : msg.content}
              </p>
            )}
            <div className="text-[10px] text-yellow-700/70 mt-1 text-right">{messageTime}</div>
          </div>
        </div>
      );
    }

    return (
      <div
        id={`msg-${msg.id}`}
        className={cn("group/bubble flex w-full", isOutbound ? "justify-end" : "justify-start")}
      >
        <div
          className={cn(
            "relative max-w-[85%] lg:max-w-[65%] px-2.5 pt-1.5 pb-1 animate-in fade-in slide-in-from-bottom-1 duration-200",
            isOutbound ? "wa-bubble-out" : "wa-bubble-in",
            isActiveMatch && "ring-2 ring-yellow-400",
          )}
        >
          <div className="absolute -top-3 -right-2 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1 z-10">
            {onReply && (
              <button
                type="button"
                onClick={() =>
                  onReply({
                    id: msg.id,
                    evolutionMessageId: msg.evolution_message_id ?? null,
                    sender: msg.sender_name || (isOutbound ? "Você" : "Contato"),
                    content: msg.content || (msg.media_url ? "[Mídia]" : ""),
                  })
                }
                className="h-6 w-6 rounded-full bg-card border shadow-sm flex items-center justify-center hover:bg-accent"
                title="Responder"
              >
                <Reply className="h-3 w-3" />
              </button>
            )}
            <Popover open={reactPopoverOpen} onOpenChange={setReactPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 rounded-full bg-card border shadow-sm flex items-center justify-center hover:bg-accent"
                  title="Reagir"
                >
                  <SmilePlus className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-1 w-auto flex gap-0.5" align="end">
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handleReact(e)}
                    className="h-8 w-8 rounded-full hover:bg-accent text-lg flex items-center justify-center transition-transform hover:scale-125"
                  >
                    {e}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <CreateTaskDialog messageId={msg.id} initialContent={msg.content || ""} />
          </div>
          {isGroup && !isOutbound && msg.sender_name && (
            <span
              className="block text-[12.5px] font-semibold mb-0.5"
              style={{ color: "#06cf9c" }}
            >
              {msg.sender_name}
            </span>
          )}
          {quoted && (quoted.content || quoted.sender) && (
            <div className="mb-1 -mx-0.5 px-2 py-1 rounded bg-black/5 dark:bg-white/5 border-l-2 border-emerald-500">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <Reply className="h-2.5 w-2.5" />
                {quoted.sender || "Mensagem citada"}
              </div>
              <div className="text-[11px] line-clamp-2 wa-meta">
                {quoted.content || "Mídia"}
              </div>
            </div>
          )}
          {msg.media_url && (
            <MediaAttachment url={msg.media_url} type={msg.media_type} metadata={msg.metadata} />
          )}
          {msg.content && msg.content !== "[Mídia]" && (
            <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words pr-16">
              {highlight ? highlightText(msg.content, highlight) : msg.content}
            </p>
          )}
          <div className="flex items-center justify-end gap-1 -mt-0.5 ml-2 float-right">
            <span className="text-[11px] wa-meta leading-none">{messageTime}</span>
            {isOutbound && (
              <span
                className="inline-flex items-center leading-none"
                title={
                  visibleDeliveryError ??
                  (read
                    ? "Lida"
                    : delivered
                      ? "Entregue"
                      : sent
                        ? "Enviada"
                        : sending
                          ? "Enviando"
                          : failed
                            ? "Falha"
                            : "")
                }
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
          {reactionGroups.length > 0 && (
            <div
              className={cn(
                "absolute -bottom-2 flex gap-0.5 bg-card border rounded-full px-1.5 py-0.5 shadow-sm text-xs",
                isOutbound ? "right-2" : "left-2",
              )}
            >
              {reactionGroups.map(([emoji, count]) => (
                <span key={emoji} className="inline-flex items-center gap-0.5">
                  <span>{emoji}</span>
                  {count > 1 && <span className="text-[10px] wa-meta">{count}</span>}
                </span>
              ))}
            </div>
          )}
          {failed && visibleDeliveryError && (
            <div className="mt-1 text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
              {visibleDeliveryError}
            </div>
          )}
        </div>
      </div>
    );
  },
);

MessageBubble.displayName = "MessageBubble";

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function PttAudio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      a.play();
    }
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 my-1 min-w-[220px]">
      <button
        onClick={toggle}
        className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
          />
        </div>
        <div className="flex items-center gap-1 mt-1 wa-meta text-[10px]">
          <Mic className="h-2.5 w-2.5" />
          <span>{fmt(playing || current > 0 ? current : duration)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        preload="metadata"
      />
    </div>
  );
}

function MediaAttachment({
  url,
  type,
  metadata,
}: {
  url: string;
  type?: string | null;
  metadata?: Record<string, any> | null;
}) {
  const t = (type || "").toLowerCase();
  const isImage = t.startsWith("image") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
  const isVideo = t.startsWith("video") || /\.(mp4|webm|mov)(\?|$)/i.test(url);
  const isAudio = t.startsWith("audio") || /\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(url);

  if (isImage) {
    return <ImageLightbox url={url} />;
  }
  if (isVideo) {
    return (
      <video src={url} controls className="rounded-md max-h-80 mb-1 -mx-1.5 -mt-1 w-full" />
    );
  }
  if (isAudio) {
    return <PttAudio url={url} />;
  }

  const fileName =
    (metadata?.file_name as string | undefined) ||
    (metadata?.filename as string | undefined) ||
    decodeURIComponent(url.split("/").pop()?.split("?")[0] || "documento");
  const fileSize = metadata?.file_size as number | undefined;
  const ext = fileName.split(".").pop()?.toUpperCase().slice(0, 4) || "DOC";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mb-1 bg-black/5 dark:bg-white/5 px-2.5 py-2 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors min-w-[220px]"
    >
      <div className="h-9 w-9 rounded bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{fileName}</div>
        <div className="text-[10px] wa-meta">
          {ext}
          {fileSize ? ` · ${formatBytes(fileSize)}` : ""}
        </div>
      </div>
    </a>
  );
}

function ImageLightbox({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (open) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const zoomOut = () =>
    setScale((s) => {
      const next = Math.max(s - 0.5, 1);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setScale((s) => {
      const next = Math.max(1, Math.min(5, s + delta));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onDoubleClick = () => {
    if (scale === 1) setScale(2);
    else {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block mb-1 -mx-1.5 -mt-1 w-full"
      >
        <img
          src={url}
          alt="mídia"
          className="rounded-md max-h-80 w-full object-cover cursor-zoom-in"
          loading="lazy"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[100vw] w-screen h-[100dvh] sm:h-screen p-0 bg-black/95 border-none rounded-none flex items-center justify-center overflow-hidden"
        >
          <div
            className="absolute inset-0 overflow-hidden flex items-center justify-center"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          >
            <img
              src={url}
              alt="mídia ampliada"
              draggable={false}
              className="max-w-full max-h-full select-none transition-transform duration-100"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                cursor: scale > 1 ? "grab" : "zoom-in",
              }}
            />
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur"
              onClick={zoomOut}
              title="Reduzir"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-white text-xs font-mono min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur"
              onClick={zoomIn}
              title="Ampliar"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <a
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur"
              title="Baixar"
            >
              <Download className="h-4 w-4" />
            </a>
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur"
              onClick={() => setOpen(false)}
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
