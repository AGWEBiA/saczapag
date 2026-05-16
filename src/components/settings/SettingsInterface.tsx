import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { User, Bell, Shield, Smartphone, Globe, UserPlus, Users, Wand2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function SettingsInterface() {
  const [loading, setLoading] = useState(false);
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const queryClient = useQueryClient();


  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ["all_agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: rules } = useQuery({
    queryKey: ["assignment_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_rules")
        .select(`*, instance:whatsapp_instances(name)`);
      if (error) throw error;
      return data;
    }
  });

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Configurações salvas com sucesso!");
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Time
          </TabsTrigger>
          <TabsTrigger value="assignment" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Atribuição
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Perfil</CardTitle>
              <CardDescription>
                Atualize seus dados pessoais e como você aparece para o time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input id="name" placeholder="Nome do usuário" defaultValue="Usuário Admin" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="email@exemplo.com" disabled />
                </div>
              </div>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Gestão de Agentes</CardTitle>
                <CardDescription>
                  Visualize e gerencie os membros da sua equipe.
                </CardDescription>
              </div>
              <Dialog open={isAddAgentOpen} onOpenChange={setIsAddAgentOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <UserPlus className="h-4 w-4" /> Gerenciar Papéis
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Gerenciar Equipe</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Para adicionar novos membros, peça para eles se cadastrarem no sistema. 
                      Aqui você pode alterar o papel de usuários existentes.
                    </p>
                    <Table>
                      <TableBody>
                        {agents?.map(agent => (
                          <TableRow key={agent.id}>
                            <TableCell>{agent.email}</TableCell>
                            <TableCell>
                              <Select 
                                defaultValue={agent.role} 
                                onValueChange={async (newRole) => {
                                  const { error } = await supabase
                                    .from('profiles')
                                    .update({ role: newRole })
                                    .eq('id', agent.id);
                                  if (error) toast.error(error.message);
                                  else {
                                    toast.success("Papel atualizado!");
                                    queryClient.invalidateQueries({ queryKey: ["all_agents"] });
                                  }
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="agent">Agente</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAgents ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">Carregando...</TableCell>
                    </TableRow>
                  ) : agents?.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.full_name || "Sem nome"}</TableCell>
                      <TableCell>{agent.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{agent.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-500">Ativo</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignment" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Regras de Atribuição</CardTitle>
                <CardDescription>
                  Configure como novas conversas são distribuídas automaticamente.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline">Nova Regra</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {rules?.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">Nenhuma regra ativa. Novos chats ficarão "Não Atribuídos".</p>
                  </div>
                ) : rules?.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{rule.name}</h4>
                      <p className="text-xs text-muted-foreground">Instância: {(rule as any).instance?.name}</p>
                    </div>
                    <Switch defaultChecked={!!rule.is_active} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Escolha como deseja ser avisado sobre novas mensagens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notificações via Browser</Label>
                  <p className="text-sm text-muted-foreground">Receba alertas quando novas mensagens chegarem.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Som de Notificação</Label>
                  <p className="text-sm text-muted-foreground">Tocar um som ao receber nova mensagem.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolution API</CardTitle>
              <CardDescription>
                Configurações globais de integração com a API de WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-url">URL Global da API</Label>
                <Input id="api-url" placeholder="https://api.seuserver.com" defaultValue="https://api.evolution.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="global-key">Global ApiKey</Label>
                <Input id="global-key" type="password" placeholder="Chave mestra da API" />
              </div>
              <Button onClick={handleSave} disabled={loading}>
                Salvar Configurações da API
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
