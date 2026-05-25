import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface CreateTaskDialogProps {
  conversationId?: string;
  messageId?: string;
  initialContent?: string;
}

export function CreateTaskDialog({ conversationId, messageId, initialContent }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(initialContent || "");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleCreateTask = async () => {
    if (!title.trim()) {
      toast.error("O título é obrigatório");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("tasks" as any).insert({
      title,
      description,
      priority,
      conversation_id: conversationId,
      message_id: messageId,
      created_by: user?.id,
      status: "todo",
    } as any);

    setLoading(false);
    if (error) {
      toast.error("Erro ao criar tarefa: " + error.message);
    } else {
      toast.success("Tarefa criada com sucesso!");
      setOpen(false);
      setTitle("");
      setDescription("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Transformar em Tarefa">
          <CheckSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Nova Tarefa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <Input 
              placeholder="Ex: Resolver problema de acesso" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Descrição</label>
            <Textarea 
              placeholder="Detalhes da tarefa..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Prioridade</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={handleCreateTask} disabled={loading}>
            {loading ? "Criando..." : "Criar Tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
