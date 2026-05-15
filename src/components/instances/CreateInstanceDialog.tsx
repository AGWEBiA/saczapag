import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: CreateInstanceDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [evolutionName, setEvolutionName] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const finalEvolutionName = evolutionName || name.toLowerCase().replace(/\s+/g, "_");

      // 1. Create in Evolution API first
      const { data: evoData, error: evoError } = await supabase.functions.invoke("evolution-api", {
        body: {
          action: "create-instance",
          instanceName: finalEvolutionName,
        },
      });

      if (evoError) throw new Error("Erro na Evolution API: " + evoError.message);
      if (evoData?.error) throw new Error(evoData.error);

      // 2. Save to Supabase
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .insert([
          {
            name,
            evolution_instance_name: finalEvolutionName,
            status: "connecting",
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_instances"] });
      toast.success("Instância criada e pronta para conexão!");
      onOpenChange(false);
      setName("");
      setEvolutionName("");
    },
    onError: (error) => {
      toast.error("Erro ao criar instância: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error("O nome da instância é obrigatório");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Instância WhatsApp</DialogTitle>
          <DialogDescription>
            Configure uma nova conexão para começar a enviar e receber mensagens.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Amigável</Label>
            <Input
              id="name"
              placeholder="Ex: WhatsApp Comercial"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evolutionName">Nome na Evolution API (opcional)</Label>
            <Input
              id="evolutionName"
              placeholder="Ex: instance_01"
              value={evolutionName}
              onChange={(e) => setEvolutionName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar Instância
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
