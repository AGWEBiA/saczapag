import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  XCircle,
  Play,
  RotateCw
} from "lucide-react";
import { toast } from "sonner";
import { CreateInstanceDialog } from "./CreateInstanceDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { instancesQueryOptions } from "@/lib/queries/instances";

export function InstanceList() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ name: string; base64: string } | null>(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<{ name: string; code: string } | null>(null);

  const { data: instances, isLoading, refetch } = useQuery({
    ...instancesQueryOptions,
    refetchInterval: 60000,
  });

  // Sincronização automática: enquanto houver instância não conectada,
  // consulta o estado real na Evolution e atualiza o banco.
  useEffect(() => {
    if (!instances?.length) return;
    const pending = instances.filter((i) => i.status !== "connected");
    if (!pending.length) return;

    let cancelled = false;

    const syncOnce = async () => {
      await Promise.all(
        pending.map(async (inst) => {
          try {
            const { data } = await supabase.functions.invoke("evolution-api", {
              body: { action: "get-status", instanceName: inst.evolution_instance_name },
            });
            const state = data?.instance?.state || data?.state;
            if (!state) return;
            const newStatus =
              state === "open" ? "connected" :
              state === "connecting" ? "connecting" :
              "disconnected";
            if (newStatus !== inst.status) {
              await supabase
                .from("whatsapp_instances")
                .update({
                  status: newStatus,
                  last_connected_at: newStatus === "connected" ? new Date().toISOString() : null,
                })
                .eq("id", inst.id);
              if (newStatus === "connected") {
                toast.success(`Instância "${inst.name}" conectada!`);
                setIsQrDialogOpen(false);
              }
            }
          } catch (err) {
            console.warn("sync status falhou para", inst.evolution_instance_name, err);
          }
        })
      );
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: instancesQueryOptions.queryKey });
      }
    };

    syncOnce();
    const interval = setInterval(syncOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances?.map((i) => `${i.id}:${i.status}`).join(",")]);

  const deleteMutation = useMutation({
    mutationFn: async ({ id, evolutionName }: { id: string; evolutionName: string }) => {
      try {
        await supabase.functions.invoke("evolution-api", {
          body: { action: "delete-instance", instanceName: evolutionName },
        });
      } catch (err) {
        console.error("Failed to delete from Evolution API", err);
      }

      const { error } = await supabase
        .from("whatsapp_instances")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instancesQueryOptions.queryKey });
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
      queryClient.invalidateQueries({ queryKey: instancesQueryOptions.queryKey });
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
        setPairingCode(null);
        setQrCodeData({ name: variables, base64: data.base64 });
        setIsQrDialogOpen(true);
      } else if (data?.instance?.state === "open") {
        toast.success("Instância já está conectada!");
        queryClient.invalidateQueries({ queryKey: instancesQueryOptions.queryKey });
      } else {
        toast.error("Não foi possível gerar o QR code no momento.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao buscar QR code: " + error.message);
    },
  });

  const regenerateQrMutation = useMutation({
    mutationFn: async (evolutionName: string) => {
      // Força reinício da sessão para invalidar QR antigo e gerar novo
      try {
        await supabase.functions.invoke("evolution-api", {
          body: { action: "logout-instance", instanceName: evolutionName },
        });
      } catch (err) {
        console.warn("logout antes de regenerar falhou (pode estar desconectado):", err);
      }
      try {
        await supabase.functions.invoke("evolution-api", {
          body: { action: "restart-instance", instanceName: evolutionName },
        });
      } catch (err) {
        console.warn("restart falhou (seguindo para connect):", err);
      }
      await new Promise((r) => setTimeout(r, 800));
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "get-qr-code", instanceName: evolutionName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      setPairingCode(null);
      if (data?.base64) {
        setQrCodeData({ name: variables, base64: data.base64 });
        setIsQrDialogOpen(true);
        toast.success("Novo QR code gerado.");
      } else {
        toast.error("Não foi possível gerar um novo QR code.");
      }
      queryClient.invalidateQueries({ queryKey: instancesQueryOptions.queryKey });
    },
    onError: (error) => {
      toast.error("Erro ao recriar QR code: " + error.message);
    },
  });

  const getPairingMutation = useMutation({
    mutationFn: async (evolutionName: string) => {
      const phone = pairingPhone.replace(/\D/g, "");
      if (phone.length < 12) throw new Error("Informe o número com DDI e DDD. Ex: 5511999999999");

      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "get-qr-code", instanceName: evolutionName, data: { number: phone } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      const code = data?.pairingCode || data?.pairing_code;
      if (code) {
        setPairingCode({ name: variables, code });
        toast.success("Código de pareamento gerado.");
      } else if (data?.base64) {
        setQrCodeData({ name: variables, base64: data.base64 });
        setIsQrDialogOpen(true);
      } else {
        toast.error("Não foi possível gerar o código. Remova a instância e crie novamente se ela ficou presa em conexão.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao gerar código: " + error.message);
    },
  });

  const setWebhookMutation = useMutation({
    mutationFn: async (evolutionName: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "set-webhook", instanceName: evolutionName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Webhook configurado! Mensagens recebidas vão aparecer no Chat.");
      console.log("[set-webhook] url:", data?.webhookUrl);
    },
    onError: (e: any) => toast.error("Erro ao configurar webhook: " + e.message),
  });


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Passo a Passo: Sua Primeira Conexão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-3 bg-card rounded-md border">
              <div className="bg-primary/10 text-primary h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
              <div>
                <p className="text-xs font-bold mb-1">Criar Instância</p>
                <p className="text-[10px] text-muted-foreground">Clique em "Nova Instância" e dê um nome amigável para identificar seu número.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-md border">
              <div className="bg-primary/10 text-primary h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
              <div>
                <p className="text-xs font-bold mb-1">Escaneie o QR Code</p>
                <p className="text-[10px] text-muted-foreground">Clique em "Conectar", abra o WhatsApp no celular e escaneie o código gerado.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-card rounded-md border">
              <div className="bg-primary/10 text-primary h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="text-xs font-bold mb-1">Valide a Conexão</p>
                <p className="text-[10px] text-muted-foreground">O status mudará para "Conectado". Agora sua equipe já pode receber mensagens!</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">Configuração e Testes</CardTitle>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Play className="h-4 w-4" /> Testar Webhook
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Simulador de Webhook</DialogTitle>
                  <DialogDescription>
                    Envie uma mensagem de teste para verificar se sua inbox está recebendo dados corretamente.
                  </DialogDescription>
                </DialogHeader>
                <WebhookTester />
              </DialogContent>
            </Dialog>
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
                    Nenhuma instância encontrada. Siga o guia acima para começar.
                  </TableCell>
                </TableRow>
              ) : (
                instances?.map((instance) => (
                  <TableRow key={instance.id}>
                    <TableCell className="font-medium">{instance.name}</TableCell>
                    <TableCell>{instance.evolution_instance_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {instance.status === "connected" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : instance.status === "error" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        <Badge variant={instance.status === "connected" ? "default" : "secondary"}>
                          {instance.status === "connected" ? "Conectado" : 
                           instance.status === "connecting" ? "Aguardando QR" : 
                           instance.status === "disconnected" ? "Desconectado" : "Erro"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(instance.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {instance.status !== "connected" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => getQrMutation.mutate(instance.evolution_instance_name)}
                              disabled={getQrMutation.isPending}
                            >
                              <QrCode className="mr-2 h-4 w-4" />
                              Conectar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Recriar QR code"
                              onClick={() => {
                                if (confirm("Recriar o QR code? Isso encerra a sessão atual e gera um novo código.")) {
                                  regenerateQrMutation.mutate(instance.evolution_instance_name);
                                }
                              }}
                              disabled={regenerateQrMutation.isPending}
                            >
                              {regenerateQrMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCw className="mr-2 h-4 w-4" />
                              )}
                              Recriar QR
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                            onClick={() => {
                              if (confirm("Deseja desconectar esta instância?")) {
                                logoutMutation.mutate(instance.evolution_instance_name);
                              }
                            }}
                            disabled={logoutMutation.isPending}
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                          </Button>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover esta instância?")) {
                              deleteMutation.mutate({ 
                                id: instance.id, 
                                evolutionName: instance.evolution_instance_name 
                              });
                            }
                          }}
                          disabled={deleteMutation.isPending}
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

      <CreateInstanceDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
      />

      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 space-y-4">
            {qrCodeData?.base64 ? (
              <div className="bg-white p-4 rounded-lg shadow-inner">
                <img 
                  src={qrCodeData.base64} 
                  alt="WhatsApp QR Code" 
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            )}
            <p className="text-sm font-medium text-center">
              Instância: <span className="text-primary">{qrCodeData?.name}</span>
            </p>
            <div className="w-full space-y-3 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                Se o WhatsApp rejeitar o QR, use o pareamento por número: informe o telefone com DDI e DDD e conecte em Aparelhos conectados &gt; Conectar com número de telefone.
              </p>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="5511999999999"
                  value={pairingPhone}
                  onChange={(event) => setPairingPhone(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => qrCodeData?.name && getPairingMutation.mutate(qrCodeData.name)}
                  disabled={getPairingMutation.isPending}
                >
                  {getPairingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar código"}
                </Button>
              </div>
              {pairingCode ? (
                <div className="rounded-md bg-background p-3 text-center">
                  <p className="text-xs text-muted-foreground">Código para {pairingCode.name}</p>
                  <p className="text-2xl font-bold tracking-widest text-primary">{pairingCode.code}</p>
                </div>
              ) : null}
            </div>
            <div className="flex w-full gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => qrCodeData?.name && regenerateQrMutation.mutate(qrCodeData.name)}
                disabled={regenerateQrMutation.isPending}
              >
                {regenerateQrMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="mr-2 h-4 w-4" />
                )}
                Recriar QR
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsQrDialogOpen(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhookTester() {
  const [phone, setPhone] = useState("5511999999999");
  const [content, setContent] = useState("Mensagem de teste!");
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("evolution_instance_name")
        .limit(1);

      if (!instances?.length) {
        toast.error("Crie uma instância primeiro!");
        return;
      }

      const { error } = await supabase.functions.invoke("evolution-api", {
        body: { 
          action: "webhook", 
          data: {
            instance: instances[0].evolution_instance_name,
            event: "messages.upsert",
            data: {
              key: {
                remoteJid: `${phone}@s.whatsapp.net`,
                fromMe: false,
                id: `TEST_${Date.now()}`
              },
              pushName: "Test User",
              message: {
                conversation: content
              }
            }
          }
        },
      });

      if (error) throw error;
      toast.success("Evento de webhook simulado! Verifique o chat.");
    } catch (err: any) {
      toast.error("Falha no teste: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase">Telefone (sem @)</label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase">Conteúdo</label>
        <Input value={content} onChange={e => setContent(e.target.value)} />
      </div>
      <Button className="w-full gap-2" onClick={handleTest} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Disparar Evento
      </Button>
    </div>
  );
}
