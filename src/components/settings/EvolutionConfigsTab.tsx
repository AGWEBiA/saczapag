import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Star, Loader2, Plug, Pencil } from "lucide-react";

type EvolutionConfig = {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  is_primary: boolean;
  is_active: boolean;
  priority: number;
  created_at: string;
};

const sb = supabase as any;

export function EvolutionConfigsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EvolutionConfig | null>(null);
  const [form, setForm] = useState({
    name: "",
    api_url: "",
    api_key: "",
    is_primary: false,
    is_active: true,
    priority: 100,
  });

  const { data: configs, isLoading, error } = useQuery({
    queryKey: ["evolution_configs"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("evolution_configs")
        .select("*")
        .order("is_primary", { ascending: false })
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EvolutionConfig[];
    },
  });

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", api_url: "", api_key: "", is_primary: false, is_active: true, priority: 100 });
  };

  const openCreate = () => { resetForm(); setOpen(true); };
  const openEdit = (c: EvolutionConfig) => {
    setEditing(c);
    setForm({
      name: c.name, api_url: c.api_url, api_key: c.api_key,
      is_primary: c.is_primary, is_active: c.is_active, priority: c.priority,
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.api_url || !form.api_key) {
        throw new Error("Preencha nome, URL e ApiKey.");
      }
      const { data: { user } } = await supabase.auth.getUser();

      // Se marcar como primária, desmarca todas as outras antes (índice único exige).
      if (form.is_primary) {
        await sb.from("evolution_configs").update({ is_primary: false }).neq("id", editing?.id ?? "00000000-0000-0000-0000-000000000000");
      }

      if (editing) {
        const { error } = await sb.from("evolution_configs").update({
          name: form.name, api_url: form.api_url, api_key: form.api_key,
          is_primary: form.is_primary, is_active: form.is_active, priority: form.priority,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("evolution_configs").insert({
          name: form.name, api_url: form.api_url, api_key: form.api_key,
          is_primary: form.is_primary, is_active: form.is_active, priority: form.priority,
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution_configs"] });
      toast.success(editing ? "Configuração atualizada." : "Configuração criada.");
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("evolution_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution_configs"] });
      toast.success("Removida.");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      await sb.from("evolution_configs").update({ is_primary: false }).neq("id", id);
      const { error } = await sb.from("evolution_configs").update({ is_primary: true, is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution_configs"] });
      toast.success("Definida como primária.");
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-api", {
        body: { action: "test-config", configId: id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.ok) throw new Error(`Falha (status ${data?.status ?? "?"})`);
      return data;
    },
    onSuccess: () => toast.success("Conexão OK ✓"),
    onError: (e: any) => toast.error("Conexão falhou: " + e.message),
  });

  const tableMissing = (error as any)?.message?.toLowerCase()?.includes("evolution_configs");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Evolution API — Instâncias</CardTitle>
          <CardDescription>
            Cadastre múltiplas instâncias para redundância. A marcada como <b>primária</b> é usada por padrão; as demais
            ficam disponíveis como fallback (ordenadas por prioridade).
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar configuração" : "Nova configuração Evolution"}</DialogTitle>
              <DialogDescription>
                Dados ficam no Supabase (somente admins têm acesso via RLS).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome (apelido)</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Hostinger Principal" />
              </div>
              <div className="space-y-2">
                <Label>URL Global da API</Label>
                <Input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })}
                  placeholder="https://evo.seudominio.com.br" />
              </div>
              <div className="space-y-2">
                <Label>Global ApiKey</Label>
                <Input type="password" value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="Chave mestra da API" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Input type="number" value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 100 })} />
                  <p className="text-xs text-muted-foreground">Menor = maior prioridade</p>
                </div>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <Label>Ativa</Label>
                    <Switch checked={form.is_active}
                      onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Primária</Label>
                    <Switch checked={form.is_primary}
                      onCheckedChange={(v) => setForm({ ...form, is_primary: v })} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {tableMissing && (
          <div className="mb-4 p-4 border border-destructive/40 bg-destructive/10 rounded-md text-sm">
            A tabela <code>evolution_configs</code> ainda não existe. Rode a SQL fornecida no chat (SQL Editor do Supabase) e recarregue.
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !configs?.length ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg text-sm text-muted-foreground">
            Nenhuma configuração cadastrada. Clique em <b>Nova</b> para começar.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.is_primary && (
                      <Badge variant="default" className="ml-2 gap-1"><Star className="h-3 w-3" /> primária</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[260px] truncate">{c.api_url}</TableCell>
                  <TableCell>{c.priority}</TableCell>
                  <TableCell>
                    {c.is_active
                      ? <Badge className="bg-green-500 hover:bg-green-500">ativa</Badge>
                      : <Badge variant="secondary">inativa</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Testar conexão"
                        onClick={() => testMutation.mutate(c.id)}
                        disabled={testMutation.isPending}>
                        <Plug className="h-4 w-4" />
                      </Button>
                      {!c.is_primary && (
                        <Button size="sm" variant="ghost" title="Tornar primária"
                          onClick={() => setPrimaryMutation.mutate(c.id)}>
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Remover"
                        onClick={() => { if (confirm(`Remover "${c.name}"?`)) deleteMutation.mutate(c.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
