import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck, AlertCircle, History, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type AuditRow = {
  id: string;
  created_at: string;
  event_type: string;
  decision: string;
  details: any;
  external_id: string | null;
  inconsistency_found: boolean;
  instance: { name: string; evolution_instance_name: string } | null;
};

type Instance = {
  id: string;
  name: string;
};

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("all");
  const [period, setPeriod] = useState<string>("24h");

  const loadInstances = async () => {
    const { data } = await supabase.from("whatsapp_instances").select("id, name");
    if (data) setInstances(data);
  };

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("webhook_audits" as any)
      .select("*, instance:whatsapp_instances(name, evolution_instance_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (selectedInstance !== "all") {
      query = query.eq("instance_id", selectedInstance);
    }

    if (period === "24h") {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", yesterday);
    } else if (period === "7d") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", weekAgo);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Audit fetch error:", error);
    } else {
      setRows((data as unknown as AuditRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInstances();
    load();
  }, [selectedInstance, period]);

  const getDecisionBadge = (decision: string) => {
    const d = decision.toLowerCase();
    if (d.includes("create")) return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Novo</Badge>;
    if (d.includes("existing")) return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Existente</Badge>;
    return <Badge variant="outline">{decision}</Badge>;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Auditoria do Webhook</h1>
          </div>
          <p className="text-muted-foreground">
            Histórico de processamento e decisões automáticas do gateway.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border">
            <Filter className="h-4 w-4 ml-2 text-muted-foreground" />
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-[180px] border-none bg-transparent shadow-none h-8">
                <SelectValue placeholder="Instância" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Instâncias</SelectItem>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] border-none bg-transparent shadow-none h-8">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo histórico</SelectItem>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-10">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <History className="h-4 w-4" /> Total de Eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Neste filtro</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur-sm border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {rows.filter(r => !r.inconsistency_found).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sem inconsistências</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" /> Inconsistências
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {rows.filter(r => r.inconsistency_found).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Requer atenção</p>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card shadow-sm border-primary/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b font-semibold">
              <tr>
                <th className="text-left p-4">Timestamp</th>
                <th className="text-left p-4">Evento</th>
                <th className="text-left p-4">Decisão</th>
                <th className="text-left p-4">Instância</th>
                <th className="text-left p-4">Msg ID</th>
                <th className="text-left p-4">Inconsistência</th>
                <th className="text-left p-4">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <History className="h-8 w-8 opacity-20" />
                      {loading ? "Carregando auditoria..." : "Nenhum dado de auditoria encontrado."}
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4 whitespace-nowrap text-xs font-medium">
                    {format(new Date(r.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                  </td>
                  <td className="p-4 font-mono text-[11px] text-primary">{r.event_type}</td>
                  <td className="p-4">{getDecisionBadge(r.decision)}</td>
                  <td className="p-4 text-xs">
                    <div className="font-medium">{r.instance?.name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{r.instance?.evolution_instance_name}</div>
                  </td>
                  <td className="p-4 font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={r.external_id || ""}>
                    {r.external_id || "—"}
                  </td>
                  <td className="p-4">
                    {r.inconsistency_found ? (
                      <Badge variant="destructive" className="animate-pulse">SIM</Badge>
                    ) : (
                      <span className="text-emerald-500 text-xs font-semibold">NÃO</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="text-[10px] text-muted-foreground max-w-[200px] truncate" title={JSON.stringify(r.details)}>
                      {r.decision.includes("group") ? "👥 Grupo" : "👤 Direct"}
                      {r.details?.content_preview && ` • ${r.details.content_preview}`}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}