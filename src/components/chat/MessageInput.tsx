import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: async () => {
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
      toast.error("Erro ao enviar mensagem: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t bg-card">
      <div className="flex gap-2">
        <Input
          placeholder="Digite sua mensagem..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={sendMutation.isPending}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={!content.trim() || sendMutation.isPending}>
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
