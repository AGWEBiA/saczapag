import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NewConversationDialogProps {
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ onCreated }: NewConversationDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instanceId, setInstanceId] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances", "connected"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id, name, status")
        .eq("status", "connected");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 12) {
        throw new Error("Informe o número com DDI e DDD. Ex: 5511999999999");
      }
      if (!instanceId) throw new Error("Selecione uma instância conectada");

      const jid = `${cleanPhone}@s.whatsapp.net`;

      // get or create contact
      let { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone_number", jid)
        .maybeSingle();

      if (!contact) {
        const { data: nc, error } = await supabase
          .from("contacts")
          .insert({ phone_number: jid, name: name.trim() || cleanPhone })
          .select("id")
          .single();
        if (error) throw error;
        contact = nc;
      } else if (name.trim()) {
        await supabase.from("contacts").update({ name: name.trim() }).eq("id", contact.id);
      }

      // get or create conversation for this instance
      let { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contact!.id)
        .eq("instance_id", instanceId)
        .maybeSingle();

      if (!conv) {
        const { data: nc, error } = await supabase
          .from("conversations")
          .insert({
            contact_id: contact!.id,
            instance_id: instanceId,
            is_group: false,
            status: "aberta",
          })
          .select("id")
          .single();
        if (error) throw error;
        conv = nc;
      }

      return conv!.id;
    },
    onSuccess: (conversationId) => {
      toast.success("Conversa criada");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      setName("");
      setPhone("");
      onCreated(conversationId);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao criar conversa"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Nova conversa">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            Inicie uma conversa nova com um número de WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Instância (WhatsApp conectado)</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma instância conectada..." />
              </SelectTrigger>
              <SelectContent>
                {instances?.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    Nenhuma instância conectada
                  </SelectItem>
                ) : (
                  instances?.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nome do contato (opcional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva"
            />
          </div>
          <div className="space-y-2">
            <Label>Número do WhatsApp (com DDI + DDD)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
            />
            <p className="text-[10px] text-muted-foreground">
              Formato internacional, sem espaços ou símbolos. Ex: 5511999999999
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !phone || !instanceId}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Iniciar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
