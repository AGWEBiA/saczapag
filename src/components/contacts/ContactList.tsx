import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, RefreshCw, Trash2, User, Phone, Upload } from "lucide-react";
import { toast } from "sonner";
import { CreateContactDialog } from "./CreateContactDialog";
import { CSVImportDialog } from "@/components/shared/CSVImportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ContactList() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const handleImportContacts = async (data: any[]) => {
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const name = item.name || "";
      const phone_number = item.phone_number || "";

      if (!name || !phone_number) {
        errors.push(`Linha ${i + 1}: Nome e Telefone são obrigatórios.`);
        continue;
      }

      try {
        const { error } = await supabase
          .from("contacts")
          .upsert({ 
            name, 
            phone_number 
          }, { 
            onConflict: "phone_number" 
          });

        if (error) throw error;
        successCount++;
      } catch (err: any) {
        errors.push(`Linha ${i + 1} (${phone_number}): ${err.message}`);
      }
    }

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    }

    return { success: successCount, errors };
  };

  const { data: contacts, isLoading, refetch } = useQuery({
    queryKey: ["contacts"],
    staleTime: 1000 * 60 * 30, // 30 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone_number, avatar_url, created_at")
        .order("name", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contato removido com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao remover contato: " + error.message);
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
        <CardTitle className="text-xl font-bold">Gerenciamento de Contatos</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Contato
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Adicionado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum contato encontrado. Adicione um novo contato para começar.
                </TableCell>
              </TableRow>
            ) : (
              contacts?.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={contact.avatar_url || ""} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {contact.phone_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(contact.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Tem certeza que deseja remover o contato ${contact.name}?`)) {
                          deleteMutation.mutate(contact.id);
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

      <CreateContactDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
      />

      <CSVImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        title="Importar Contatos"
        description="Selecione um arquivo CSV para importar múltiplos contatos."
        fields={[
          { key: "name", label: "Nome", required: true, aliases: ["nome", "name", "contato", "display name"] },
          { key: "phone_number", label: "Telefone", required: true, aliases: ["telefone", "phone", "whatsapp", "celular", "phone_number"] },
        ]}
        onImport={handleImportContacts}
        templateHeaders={["nome", "telefone"]}
      />
    </Card>
  );
}
