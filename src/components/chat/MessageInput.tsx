import { useState, useRef, useMemo } from "react";
import { useMutation, useQueryClient, useQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Zap, AtSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerFn } from "@tanstack/react-start";
import { sendMessage as sendMessageFn } from "@/lib/send-message.functions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface MessageInputProps {
  conversationId: string;
  isGroup?: boolean;
}

type CachedMessage = {
  id: string;
  content: string | null;
  created_at: string;
  direction: string;
  sender_name: string | null;
  is_internal: boolean | null;
  evolution_message_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CachedMessages = InfiniteData<CachedMessage[], string | null>;

export function MessageInput({ conversationId, isGroup }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [openQuickReplies, setOpenQuickReplies] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const sendMessage = useServerFn(sendMessageFn);

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (teamMembers || [])
      .filter((m: any) => {
        const name = (m.full_name || "").toLowerCase();
        const handle = (m.email || "").split("@")[0].toLowerCase();
        return !q || name.includes(q) || handle.includes(q);
      })
      .slice(0, 6);
  }, [teamMembers, mentionQuery]);

  const { data: profile } = useQuery({
    queryKey: ["current_profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id);
      return data?.[0] || null;
    },
  });

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_replies").select("*").order("shortcut");
      if (error) throw error;
      return data;
    },
  });

  type SendVars = { text: string; internal: boolean; senderName: string; jobTitle: string; userId: string };

  const sendMutation = useMutation({
    onMutate: async (vars: SendVars) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId] });
      const previous = queryClient.getQueryData<CachedMessages>(["messages", conversationId]);
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: CachedMessage = {
        id: optimisticId,
        content: vars.text,
        created_at: new Date().toISOString(),
        direction: "outbound",
        sender_name: vars.senderName,
        is_internal: vars.internal,
        evolution_message_id: null,
        metadata: { delivery_status: "pending", optimistic: true },
      };
      queryClient.setQueryData<CachedMessages>(["messages", conversationId], (old) => {
        if (!old) {
          return { pages: [[optimistic]], pageParams: [null] } as CachedMessages;
        }
        const pages = [...old.pages];
        pages[0] = [optimistic, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      return { previous, optimisticId };
    },
    mutationFn: async (vars: SendVars) => {
      if (vars.internal) {
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          direction: "outbound",
          content: vars.text,
          is_internal: true,
          sender_user_id: vars.userId,
          sender_name: vars.senderName,
          type: "internal",
        });
        if (error) throw error;
        return null;
      }

      const signature = `[${vars.senderName} - ${vars.jobTitle}]: `;
      const finalContent = isGroup ? `${signature}${vars.text}` : vars.text;

      const data = await sendMessage({
        data: {
          conversationId,
          content: finalContent,
          senderName: vars.senderName,
        },
      });

      if (!data) throw new Error("Erro desconhecido ao processar o envio da mensagem.");
      return data as CachedMessage;
    },
    onSuccess: (data, _vars, ctx) => {
      const deliveryStatus = data?.metadata?.delivery_status;
      const deliveryError = typeof data?.metadata?.error === "string" ? data.metadata.error : null;
      if (deliveryStatus === "failed") {
        toast.error(`Mensagem não enviada: ${deliveryError || "falha na confirmação do WhatsApp."}`);
      }
      if (data?.id) {
        queryClient.setQueryData<CachedMessages>(["messages", conversationId], (old) => {
          if (!old) return old;
          const returnedMessage = data as CachedMessage;
          let replaced = false;
          const pages = old.pages.map((page) =>
            page.map((message) => {
              if (message.id === ctx?.optimisticId || message.id === returnedMessage.id) {
                replaced = true;
                return returnedMessage;
              }
              return message;
            }),
          );
          if (!replaced) pages[0] = [returnedMessage, ...(pages[0] ?? [])];
          return { ...old, pages };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["messages", conversationId], ctx.previous);
      }
      toast.error("Erro ao enviar: " + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || sendMutation.isPending) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    const senderName = profile?.full_name || user.email?.split("@")[0] || "Agente";
    const jobTitle = profile?.role || "Atendimento";
    setContent("");
    sendMutation.mutate({ text, internal: isInternal, senderName, jobTitle, userId: user.id });
  };

  return (
    <div className="p-4 lg:p-8 border-t bg-card/60 backdrop-blur-2xl space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          variant={isInternal ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsInternal(!isInternal)}
          className={cn(
            "text-[10px] lg:text-xs font-bold uppercase tracking-widest px-4 h-8 rounded-full transition-all duration-300",
            isInternal
              ? "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 border-none shadow-lg shadow-yellow-500/20 ring-2 ring-yellow-400/50"
              : "hover:bg-primary/5 hover:text-primary hover:border-primary/20",
          )}
        >
          {isInternal ? "Modo: Nota Interna" : "Nota Interna"}
        </Button>

        <Popover open={openQuickReplies} onOpenChange={setOpenQuickReplies}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <Zap className="h-3 w-3" /> Respostas Rápidas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-80" align="start">
            <Command>
              <CommandInput placeholder="Buscar resposta rápida..." />
              <CommandList>
                <CommandEmpty>Nenhuma resposta encontrada.</CommandEmpty>
                <CommandGroup heading="Atalhos">
                  {quickReplies?.map((reply) => (
                    <CommandItem
                      key={reply.id}
                      onSelect={() => {
                        setContent(reply.content);
                        setOpenQuickReplies(false);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-primary">/{reply.shortcut}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {reply.content}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1 relative group">
          {mentionQuery !== null && mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 flex items-center gap-1.5">
                <AtSign className="h-3 w-3" /> Mencionar membro do time
              </div>
              {mentionCandidates.map((member: any, i: number) => {
                const handle = (member.email || "").split("@")[0];
                return (
                  <button
                    key={member.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(i)}
                    onClick={() => insertMention(handle)}
                    className={cn(
                      "w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors",
                      i === mentionIndex ? "bg-primary/10" : "hover:bg-accent",
                    )}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {(member.full_name || handle).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{member.full_name || handle}</span>
                      <span className="text-[10px] text-muted-foreground">@{handle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <Input
            ref={inputRef}
            placeholder={
              isInternal
                ? "Digite uma nota apenas para a equipe... (cite com @)"
                : "Escreva sua mensagem aqui... (cite com @ para notificar o time)"
            }
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            disabled={sendMutation.isPending}
            className={cn(
              "flex-1 min-h-[44px] py-3 lg:h-12 lg:px-6 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary/20 transition-all rounded-2xl lg:rounded-3xl shadow-inner",
              isInternal && "border-yellow-300 focus-visible:ring-yellow-400 bg-yellow-50/50",
            )}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!content.trim() || sendMutation.isPending}
          className={cn(
            "h-11 w-11 lg:h-12 lg:w-12 rounded-2xl lg:rounded-full shrink-0 shadow-lg transition-all duration-300 active:scale-95",
            isInternal
              ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950 shadow-yellow-500/20"
              : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20 hover:shadow-primary/30",
          )}
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </form>
    </div>
  );
}
