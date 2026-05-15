import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (isInternal) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        const { error } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            direction: "outbound",
            content: content.trim(),
            is_internal: true,
            sender_user_id: user.id,
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
          content: content.trim(),
          phone: phone 
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
      <div className="flex gap-2 mb-2">
        <Button 
          type="button" 
          variant={isInternal ? "secondary" : "ghost"} 
          size="sm"
          onClick={() => setIsInternal(!isInternal)}
          className={cn("text-xs gap-1", isInternal && "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200")}
        >
          {isInternal ? "Nota Interna Ativada" : "Enviar Nota Interna"}
        </Button>
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
