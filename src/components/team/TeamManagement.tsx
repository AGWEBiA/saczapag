import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UserPlus, Upload, Trash2, Mail, Phone, Briefcase, Lock, Download, Edit, Key, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function TeamManagement() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Form states
  const [formData, setFormData] = useState({
    id: "",
    email: "",
    password: "",
    fullName: "",
    whatsapp: "",
    position: "",
    role: "agent",
    status: "active"
  });

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["team_members"],
    staleTime: 1000 * 60 * 60, // 1 hora
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const manageMemberMutation = useMutation({
    mutationFn: async ({ action, data }: { action: string; data: any }) => {
      const { data: response, error } = await supabase.functions.invoke("manage-team", {
        body: { ...data, action },
      });
      if (error) throw error;
      if (response.error) throw new Error(response.error);
      return response;
    },
    onSuccess: (_, variables) => {
      const actionMsg = variables.action === "create" ? "cadastrado" : 
                        variables.action === "update" ? "atualizado" : 
                        variables.action === "delete" ? "removido" : "processado";
      
      toast.success(`Membro da equipe ${actionMsg} com sucesso!`);
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setIsDeleteAlertOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (error: any) => {
      toast.error("Erro na operação: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      id: "",
      email: "",
      password: "",
      fullName: "",
      whatsapp: "",
      position: "",
      role: "agent",
      status: "active"
    });
    setSelectedMember(null);
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    manageMemberMutation.mutate({ action: "create", data: formData });
  };

  const handleEditMember = (e: React.FormEvent) => {
    e.preventDefault();
    manageMemberMutation.mutate({ action: "update", data: formData });
  };

  const handleDeleteMember = () => {
    if (selectedMember) {
      manageMemberMutation.mutate({ action: "delete", data: { id: selectedMember.id } });
    }
  };

  const handleResetPassword = (email: string) => {
    manageMemberMutation.mutate({ action: "reset-password", data: { email } });
  };

  const openEditModal = (member: any) => {
    setSelectedMember(member);
    setFormData({
      id: member.id,
      email: member.email || "",
      password: "", // Password not needed for update unless changing it
      fullName: member.full_name || "",
      whatsapp: member.whatsapp_number || "",
      position: member.position || "",
      role: member.role || "agent",
      status: (member as any).status || "active"
    });
    setIsEditModalOpen(true);
  };

  const downloadCSVTemplte = () => {
    const headers = ["email", "senha", "nome"];
    const example = ["exemplo@empresa.com", "Senha123!", "João Silva"];
    const csvContent = [headers.join(","), example.join(",")].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "template_equipe.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportErrors([]);
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      let text = event.target?.result as string;
      // Remove BOM (UTF-8) comum em arquivos salvos pelo Excel
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      if (lines.length <= 1) {
        toast.error("Arquivo CSV vazio ou inválido.");
        setLoading(false);
        return;
      }

      // Detecta delimitador (Excel BR costuma usar ;)
      const delimiter = (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      let successCount = 0;
      const errors: string[] = [];
      const existingEmails = teamMembers?.map(m => m.email?.toLowerCase()) || [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ""));
        const email = (values[0] || "").toLowerCase();
        const password = values[1];
        const fullName = values[2];

        if (!email || !fullName) {
          errors.push(`Linha ${i + 1}: E-mail e Nome são obrigatórios.`);
          continue;
        }

        if (!emailRegex.test(email)) {
          errors.push(`Linha ${i + 1}: E-mail "${email}" tem formato inválido.`);
          continue;
        }

        if (existingEmails.includes(email)) {
          errors.push(`Linha ${i + 1}: E-mail ${email} já cadastrado.`);
          continue;
        }

        const memberData = {
          email,
          password: password || "Mudar123!",
          fullName,
          // whatsapp,
          // position,
          role: "agent",
        };

        try {
          const { data, error } = await supabase.functions.invoke("manage-team", { body: memberData });
          if (error || data.error) throw new Error(error?.message || data.error);
          successCount++;
        } catch (err: any) {
          errors.push(`Linha ${i + 1}: ${err.message}`);
        }
      }

      setLoading(false);
      setImportErrors(errors);
      
      if (successCount > 0) {
        toast.success(`${successCount} membros importados com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ["team_members"] });
      }
      
      if (errors.length > 0) {
        toast.error(`${errors.length} linhas falharam na importação.`);
      } else {
        setIsImportModalOpen(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground">
            Gerencie os membros do seu time e suas permissões de acesso.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={downloadCSVTemplte}>
            <Download className="h-4 w-4" /> Template CSV
          </Button>
          
          <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" /> Importar CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Importar Equipe</DialogTitle>
                <DialogDescription>
                  Selecione um arquivo CSV para importar múltiplos membros.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="csv">Arquivo CSV</Label>
                  <Input id="csv" type="file" accept=".csv" onChange={handleImportCSV} disabled={loading} />
                </div>
                
                {importErrors.length > 0 && (
                  <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 max-h-40 overflow-y-auto">
                    <div className="flex items-center gap-2 text-destructive font-medium mb-1">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Erros na importação:</span>
                    </div>
                    <ul className="text-xs space-y-1 text-destructive/90">
                      {importErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddModalOpen} onOpenChange={(open) => {
            setIsAddModalOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" /> Novo Membro
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <form onSubmit={handleAddMember}>
                <DialogHeader>
                  <DialogTitle>Adicionar Membro</DialogTitle>
                  <DialogDescription>
                    Preencha os dados abaixo para criar o acesso do novo colaborador.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="fullName">Nome Completo</Label>
                      <Input
                        id="fullName"
                        placeholder="João Silva"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="joao@exemplo.com"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="password">Senha Inicial</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="whatsapp">WhatsApp (Opcional)</Label>
                      <Input
                        id="whatsapp"
                        placeholder="5511999999999"
                        value={formData.whatsapp}
                        onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                        disabled
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="position">Função / Cargo (Opcional)</Label>
                      <Input
                        id="position"
                        placeholder="Atendimento"
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        disabled
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="role">Nível de Acesso</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => setFormData({ ...formData, role: value })}
                      >
                        <SelectTrigger id="role">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">Agente</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={manageMemberMutation.isPending}>
                    {manageMemberMutation.isPending ? "Cadastrando..." : "Confirmar Cadastro"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
        setIsEditModalOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditMember}>
            <DialogHeader>
              <DialogTitle>Editar Membro</DialogTitle>
              <DialogDescription>
                Atualize as informações do colaborador.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-fullName">Nome Completo</Label>
                  <Input
                    id="edit-fullName"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">E-mail</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-whatsapp">WhatsApp (Em breve)</Label>
                  <Input
                    id="edit-whatsapp"
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    disabled
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-position">Função / Cargo (Em breve)</Label>
                  <Input
                    id="edit-position"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    disabled
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-role">Nível de Acesso</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger id="edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agente</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                className="gap-2"
                onClick={() => handleResetPassword(formData.email)}
                disabled={manageMemberMutation.isPending}
              >
                <Key className="h-4 w-4" /> Resetar Senha
              </Button>
              <Button type="submit" disabled={manageMemberMutation.isPending}>
                {manageMemberMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá desativar o acesso do colaborador <strong>{selectedMember?.full_name}</strong> ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedMember(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Membros Ativos</CardTitle>
          <CardDescription>
            Lista de todos os colaboradores com acesso ao sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Carregando membros da equipe...
                  </TableCell>
                </TableRow>
              ) : teamMembers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum membro cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                teamMembers?.map((member) => (
                  <TableRow key={member.id} className={(member as any).status === 'inactive' ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{member.full_name || "N/A"}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{(member as any).whatsapp_number || "N/A"}</TableCell>
                    <TableCell>{(member as any).position || "N/A"}</TableCell>
                    <TableCell>
                      <span className="capitalize px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
                        {member.role || "Agente"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={(member as any).status === 'inactive' ? 'secondary' : 'default'} className={(member as any).status === 'inactive' ? '' : 'bg-green-500'}>
                        {(member as any).status === 'inactive' ? 'Inativo' : 'Ativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-primary"
                          onClick={() => openEditModal(member)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setSelectedMember(member);
                            setIsDeleteAlertOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}