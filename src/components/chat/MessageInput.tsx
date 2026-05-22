import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function MessageInput({ conversationId, isGroup }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [openQuickReplies, setOpenQuickReplies] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["current_profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
  });

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("*")
        .order("shortcut");
      if (error) throw error;
      return data;
    }
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const senderName = profile?.full_name || user.email?.split('@')[0] || "Agente";
      const jobTitle = profile?.role || "Atendimento";
      const signature = `[${senderName} - ${jobTitle}]: `;
      const finalContent = isGroup ? `${signature}${content.trim()}` : content.trim();

      if (isInternal) {
        const { error } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            direction: "outbound",
            content: content.trim(),
            is_internal: true,
            sender_user_id: user.id,
            sender_name: senderName,
            type: 'internal'
          });
        
        if (error) throw error;
        return { success: true };
      }

      // Fetch phone number for WhatsApp API
      const { data: convData } = await supabase
        .from("conversations")
        .select("contact:contacts(phone_number)")
        .eq("id", conversationId)
        .single();
      
      const phone = (convData as any)?.contact?.phone_number;
      if (!phone) throw new Error("Telefone do contato não encontrado");

      const { data, error } = await supabase.functions.invoke("send-message", {
        body: { 
          conversationId, 
          content: finalContent,
          phone: phone,
          senderName: senderName
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setContent("");
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
    <div className="p-4 border-t bg-card space-y-2">
      <div className="flex gap-2 mb-2 items-center">
        <Button 
          type="button" 
          variant={isInternal ? "secondary" : "ghost"} 
          size="sm"
          onClick={() => setIsInternal(!isInternal)}
          className={cn("text-xs gap-1", isInternal && "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200")}
        >
          {isInternal ? "Nota Interna Ativada" : "Nota Interna"}
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
                        <span className="text-xs text-muted-foreground line-clamp-1">{reply.content}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder={isInternal ? "Digite uma nota apenas para a equipe..." : "Digite sua mensagem..."}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={sendMutation.isPending}
          className={cn("flex-1", isInternal && "border-yellow-300 focus-visible:ring-yellow-400 bg-yellow-50/50")}
        />
        <Button 
          type="submit" 
          size="icon" 
          disabled={!content.trim() || sendMutation.isPending}
          className={cn(isInternal && "bg-yellow-600 hover:bg-yellow-700")}
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
