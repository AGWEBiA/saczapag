import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Users, Loader2, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function GroupImportDialog() {
  const [open, setOpen] = useState(false);
  const [instanceId, setInstanceId] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: instances } = useQuery({
    queryKey: ["whatsapp_instances", "connected"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("id, name, status, evolution_instance_name")
        .eq("status", "connected");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const selectedInstance = instances?.find(i => i.id === instanceId);

  const { data: groups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["evolution-groups", selectedInstance?.evolution_instance_name],
    queryFn: async () => {
      if (!selectedInstance) return [];
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { 
          action: "fetch-groups", 
          instanceName: selectedInstance.evolution_instance_name 
        }
      });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedInstance,
  });

  const filteredGroups = groups?.filter(g => 
    g.subject?.toLowerCase().includes(search.toLowerCase()) || 
    g.id?.includes(search)
  ) || [];

  const toggleGroup = (id: string) => {
    setSelectedGroups(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!instanceId || selectedGroups.length === 0) return;

      const groupsToImport = groups?.filter(g => selectedGroups.includes(g.id)) || [];

      for (const group of groupsToImport) {
        // 1. Get or create contact
        let { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_number", group.id)
          .maybeSingle();

        if (!contact) {
          const { data: nc, error } = await supabase
            .from("contacts")
            .insert({ 
              phone_number: group.id, 
              name: group.subject || "Grupo sem nome" 
            })
            .select("id")
            .single();
          if (error) throw error;
          contact = nc;
        }

        // 2. Get or create conversation
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contact!.id)
          .eq("instance_id", instanceId)
          .maybeSingle();

        if (!conv) {
          await supabase
            .from("conversations")
            .insert({
              contact_id: contact!.id,
              instance_id: instanceId,
              is_group: true,
              status: "aberta",
            });
        }
      }
    },
    onSuccess: () => {
      toast.success(`${selectedGroups.length} grupos importados com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      setSelectedGroups([]);
      setInstanceId("");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao importar grupos"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Gerenciar Grupos">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md flex flex-col h-[80vh]">
        <DialogHeader>
          <DialogTitle>Gerenciar Grupos</DialogTitle>
          <DialogDescription>
            Escolha quais grupos do WhatsApp você deseja gerenciar no sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 flex flex-col min-h-0">
          <div className="space-y-2">
            <label className="text-sm font-medium">1. Selecione a Instância</label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um WhatsApp..." />
              </SelectTrigger>
              <SelectContent>
                {instances?.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {instanceId && (
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">2. Selecione os Grupos</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar grupos..." 
                    className="pl-8" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-md p-2">
                {isLoadingGroups ? (
                  <div className="flex items-center justify-center h-full py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum grupo encontrado.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredGroups.map((group) => (
                      <div 
                        key={group.id}
                        className="flex items-center space-x-3 p-2 rounded-sm hover:bg-accent cursor-pointer"
                        onClick={() => toggleGroup(group.id)}
                      >
                        <Checkbox 
                          checked={selectedGroups.includes(group.id)}
                          onCheckedChange={() => toggleGroup(group.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{group.subject}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{group.id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              <div className="text-xs text-muted-foreground px-1">
                {selectedGroups.length} grupo(s) selecionado(s)
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || selectedGroups.length === 0}
          >
            {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importar Selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
