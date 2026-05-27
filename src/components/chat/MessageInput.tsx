import { useState } from "react";
import { useMutation, useQueryClient, useQuery, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Zap } from "lucide-react";
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
  const queryClient = useQueryClient();
  const sendMessage = useServerFn(sendMessageFn);

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

  const sendMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const senderName = profile?.full_name || user.email?.split("@")[0] || "Agente";
      const jobTitle = profile?.role || "Atendimento";
      const signature = `[${senderName} - ${jobTitle}]: `;
      const finalContent = isGroup ? `${signature}${content.trim()}` : content.trim();

      if (isInternal) {
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          direction: "outbound",
          content: content.trim(),
          is_internal: true,
          sender_user_id: user.id,
          sender_name: senderName,
          type: "internal",
        });

        if (error) throw error;
        return null;
      }

      const data = await sendMessage({
        data: {
          conversationId,
          content: finalContent,
          senderName: senderName,
        },
      });

      if (!data) {
        throw new Error("Erro desconhecido ao processar o envio da mensagem.");
      }

      return data as CachedMessage;
    },
    onSuccess: (data) => {
      setContent("");
      const deliveryStatus = data?.metadata?.delivery_status;
      const deliveryError = typeof data?.metadata?.error === "string" ? data.metadata.error : null;
      if (deliveryStatus === "failed") {
        toast.error(
          `Mensagem não enviada: ${deliveryError || "falha na confirmação do WhatsApp."}`,
        );
      }
      if (data?.id) {
        queryClient.setQueryData<CachedMessages>(["messages", conversationId], (old) => {
          if (!old) return old;
          const returnedMessage = data as CachedMessage;
          let found = false;
          const pages = old.pages.map((page) =>
            page.map((message) => {
              if (message.id !== returnedMessage.id) return message;
              found = true;
              return returnedMessage;
            }),
          );
          if (!found) {
            pages[0] = [returnedMessage, ...(pages[0] ?? [])];
          }
          return { ...old, pages };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      toast.error("Erro ao enviar: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
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
          <Input
            placeholder={
              isInternal
                ? "Digite uma nota apenas para a equipe... (cite com @)"
                : "Escreva sua mensagem aqui... (cite com @ para notificar o time)"
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
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
