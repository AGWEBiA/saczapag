import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Loader2, 
  Plus, 
  RefreshCw, 
  Trash2, 
  QrCode, 
  LogOut,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { CreateInstanceDialog } from "./CreateInstanceDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function InstanceList() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ name: string; base64: string } | null>(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);

  const { data: instances, isLoading, refetch } = useQuery({
    queryKey: ["whatsapp_instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds to catch status changes
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, evolutionName }: { id: string; evolutionName: string }) => {
      // 1. Delete from Evolution API
      try {
        await supabase.functions.invoke("evolution-api", {
          body: { action: "delete-instance", instanceName: evolutionName },
        });
      } catch (err) {
        console.error("Failed to delete from Evolution API, proceeding anyway", err);
      }

      // 2. Delete from Supabase
      const { error } = await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_instances"] });
      toast.success("Instância removida com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao remover instância: " + error.message);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async (evolutionName: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "logout-instance", instanceName: evolutionName },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_instances"] });
      toast.success("Logout realizado com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao realizar logout: " + error.message);
    },
  });

  const getQrMutation = useMutation({
    mutationFn: async (evolutionName: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "get-qr-code", instanceName: evolutionName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.base64) {
        setQrCodeData({ name: variables, base64: data.base64 });
        setIsQrDialogOpen(true);
      } else if (data?.instance?.state === "open") {
        toast.success("Instância já está conectada!");
        queryClient.invalidateQueries({ queryKey: ["whatsapp_instances"] });
      } else {
        toast.error("Não foi possível gerar o QR code no momento.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao buscar QR code: " + error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-bold">Instâncias WhatsApp</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Instância
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Instância Evolution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhuma instância encontrada. Clique em "Nova Instância" para começar.
                </TableCell>
              </TableRow>
            ) : (
              instances?.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell className="font-medium">{instance.name}</TableCell>
                  <TableCell>{instance.evolution_instance_name}</TableCell>
                  <TableCell>
                    <Badge variant={instance.status === "connected" ? "default" : "secondary"}>
                      {instance.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(instance.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja remover esta instância?")) {
                          deleteMutation.mutate(instance.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <CreateInstanceDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
      />
    </Card>
  );
}
