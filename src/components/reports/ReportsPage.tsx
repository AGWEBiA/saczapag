import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { Clock, MessageSquare, Trophy, Settings as SettingsIcon, AlertTriangle } from "lucide-react";

type Period = "today" | "7d" | "30d" | "year";
type Granularity = "day" | "week" | "month" | "year";

function periodStart(p: Period): Date {
  const d = new Date();
  if (p === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "7d") {
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (p === "30d") {
    d.setDate(d.getDate() - 30);
    return d;
  }
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtSeconds(s: number | null | undefined): string {
  if (s == null || isNaN(s)) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

const QK = {
  sla: "sla-settings",
  agents: "report-agents",
  responseTimes: "report-response-times",
  volume: "report-volume",
};

export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("7d");

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Relatórios & Produtividade</h1>
          <p className="text-sm text-muted-foreground">Métricas de SLA, volume e ranking por agente.</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="sla">
        <TabsList>
          <TabsTrigger value="sla"><Clock className="h-4 w-4 mr-1.5" />SLA</TabsTrigger>
          <TabsTrigger value="volume"><MessageSquare className="h-4 w-4 mr-1.5" />Volume</TabsTrigger>
          <TabsTrigger value="ranking"><Trophy className="h-4 w-4 mr-1.5" />Ranking</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1.5" />Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="sla" className="mt-4">
          <SlaPanel period={period} />
        </TabsContent>
        <TabsContent value="volume" className="mt-4">
          <VolumePanel period={period} />
        </TabsContent>
        <TabsContent value="ranking" className="mt-4">
          <RankingPanel period={period} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useSlaSettings() {
  return useQuery({
    queryKey: [QK.sla],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("sla_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return (data as any) || { id: 1, green_seconds: 300, yellow_seconds: 900, business_hours_only: false };
    },
  });
}

function useAgents() {
  return useQuery({
    queryKey: [QK.agents],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });
}

function SlaPanel({ period }: { period: Period }) {
  const { data: settings } = useSlaSettings();
  const { data: agents } = useAgents();
  const start = useMemo(() => periodStart(period), [period]);
  const startISO = start.toISOString();

  const { data, isLoading } = useQuery({
    queryKey: [QK.responseTimes, period],
    staleTime: 30_000,
    queryFn: async () => {
      // Conversas com primeira resposta no período
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, assigned_to, first_response_seconds, first_response_at")
        .gte("first_response_at", startISO)
        .not("first_response_seconds", "is", null);

      // Todas as respostas (outbound não-internas) no período com response_time_seconds
      const { data: outs } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_user_id, response_time_seconds, created_at")
        .gte("created_at", startISO)
        .eq("direction", "outbound")
        .eq("is_internal", false)
        .not("response_time_seconds", "is", null);

      return { convs: convs ?? [], outs: outs ?? [] };
    },
  });

  const stats = useMemo(() => {
    const convs = data?.convs ?? [];
    const outs = data?.outs ?? [];
    const firstTimes = convs.map((c: any) => c.first_response_seconds).filter((v: number) => v != null);
    const allTimes = outs.map((o: any) => o.response_time_seconds).filter((v: number) => v != null);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const green = settings?.green_seconds ?? 300;
    const yellow = settings?.yellow_seconds ?? 900;
    const withinGreen = allTimes.filter((t) => t <= green).length;
    const withinYellow = allTimes.filter((t) => t > green && t <= yellow).length;
    const broken = allTimes.filter((t) => t > yellow).length;
    return {
      conversations: convs.length,
      responses: allTimes.length,
      avgFirst: avg(firstTimes),
      medFirst: median(firstTimes),
      avgAll: avg(allTimes),
      medAll: median(allTimes),
      withinGreen,
      withinYellow,
      broken,
      slaPct: allTimes.length ? Math.round((withinGreen / allTimes.length) * 100) : 0,
    };
  }, [data, settings]);

  // Por agente atribuído (assigned_to)
  const perAgent = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const o of data?.outs ?? []) {
      const uid = (o as any).sender_user_id;
      if (!uid) continue;
      const list = map.get(uid) ?? [];
      list.push((o as any).response_time_seconds);
      map.set(uid, list);
    }
    return Array.from(map.entries())
      .map(([uid, times]) => ({
        uid,
        name: agents?.find((a: any) => a.id === uid)?.full_name || agents?.find((a: any) => a.id === uid)?.email || uid.slice(0, 8),
        count: times.length,
        avg: times.reduce((a, b) => a + b, 0) / times.length,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [data, agents]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Conversas com resposta" value={String(stats.conversations)} loading={isLoading} />
        <KpiCard label="Total de respostas" value={String(stats.responses)} loading={isLoading} />
        <KpiCard label="1ª resposta (média)" value={fmtSeconds(stats.avgFirst)} loading={isLoading} sub={`mediana ${fmtSeconds(stats.medFirst)}`} />
        <KpiCard label="Atendimento dentro do SLA" value={`${stats.slaPct}%`} loading={isLoading} highlight={stats.slaPct >= 80 ? "good" : stats.slaPct >= 60 ? "warn" : "bad"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição contra a meta</CardTitle>
          <CardDescription>
            Verde até {fmtSeconds(settings?.green_seconds)} · Amarelo até {fmtSeconds(settings?.yellow_seconds)} · Vermelho acima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stacked green={stats.withinGreen} yellow={stats.withinYellow} red={stats.broken} />
          <div className="flex gap-4 text-xs mt-3">
            <span className="flex items-center gap-1.5"><Dot c="bg-emerald-500" /> {stats.withinGreen} no prazo</span>
            <span className="flex items-center gap-1.5"><Dot c="bg-amber-500" /> {stats.withinYellow} atenção</span>
            <span className="flex items-center gap-1.5"><Dot c="bg-red-500" /> {stats.broken} estouro</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tempo de resposta por agente</CardTitle>
          <CardDescription>Considera mensagens em que o agente foi quem respondeu (sender_user_id).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Respostas</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perAgent.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
              )}
              {perAgent.map((row) => {
                const green = settings?.green_seconds ?? 300;
                const yellow = settings?.yellow_seconds ?? 900;
                const color = row.avg <= green ? "bg-emerald-500" : row.avg <= yellow ? "bg-amber-500" : "bg-red-500";
                const label = row.avg <= green ? "Ótimo" : row.avg <= yellow ? "Atenção" : "Crítico";
                return (
                  <TableRow key={row.uid}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{fmtSeconds(row.avg)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold`}>
                        <span className={`w-2 h-2 rounded-full ${color}`} /> {label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function VolumePanel({ period }: { period: Period }) {
  const start = useMemo(() => periodStart(period), [period]);
  const { data: agents } = useAgents();
  const { data, isLoading } = useQuery({
    queryKey: [QK.volume, period],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, sender_user_id, direction, is_internal, created_at, conversation_id")
        .gte("created_at", start.toISOString())
        .eq("direction", "outbound")
        .eq("is_internal", false);
      return msgs ?? [];
    },
  });

  const byAgent = useMemo(() => {
    const map = new Map<string, { count: number; convs: Set<string> }>();
    for (const m of data ?? []) {
      const uid = (m as any).sender_user_id;
      if (!uid) continue;
      const entry = map.get(uid) ?? { count: 0, convs: new Set() };
      entry.count += 1;
      entry.convs.add((m as any).conversation_id);
      map.set(uid, entry);
    }
    return Array.from(map.entries())
      .map(([uid, v]) => ({
        uid,
        name: agents?.find((a: any) => a.id === uid)?.full_name || agents?.find((a: any) => a.id === uid)?.email || uid.slice(0, 8),
        messages: v.count,
        conversations: v.convs.size,
        avgPerConv: v.convs.size ? v.count / v.convs.size : 0,
      }))
      .sort((a, b) => b.messages - a.messages);
  }, [data, agents]);

  const total = (data ?? []).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Mensagens enviadas" value={String(total)} loading={isLoading} />
        <KpiCard label="Agentes ativos" value={String(byAgent.length)} loading={isLoading} />
        <KpiCard label="Média por agente" value={byAgent.length ? Math.round(total / byAgent.length).toString() : "0"} loading={isLoading} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volume por agente</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Mensagens</TableHead>
                <TableHead className="text-right">Conversas únicas</TableHead>
                <TableHead className="text-right">Msg/conversa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAgent.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
              )}
              {byAgent.map((row) => (
                <TableRow key={row.uid}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.messages}</TableCell>
                  <TableCell className="text-right">{row.conversations}</TableCell>
                  <TableCell className="text-right">{row.avgPerConv.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RankingPanel({ period }: { period: Period }) {
  const start = useMemo(() => periodStart(period), [period]);
  const { data: settings } = useSlaSettings();
  const { data: agents } = useAgents();

  const { data, isLoading } = useQuery({
    queryKey: ["report-ranking", period],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: outs } = await supabase
        .from("messages")
        .select("sender_user_id, response_time_seconds, conversation_id, created_at")
        .gte("created_at", start.toISOString())
        .eq("direction", "outbound")
        .eq("is_internal", false);
      const { data: resolved } = await supabase
        .from("conversations")
        .select("id, assigned_to, status, updated_at")
        .gte("updated_at", start.toISOString())
        .eq("status", "resolvida");
      return { outs: outs ?? [], resolved: resolved ?? [] };
    },
  });

  const rows = useMemo(() => {
    const map = new Map<string, { msgs: number; convs: Set<string>; times: number[]; resolved: number }>();
    for (const m of data?.outs ?? []) {
      const uid = (m as any).sender_user_id;
      if (!uid) continue;
      const e = map.get(uid) ?? { msgs: 0, convs: new Set(), times: [], resolved: 0 };
      e.msgs += 1;
      e.convs.add((m as any).conversation_id);
      if ((m as any).response_time_seconds != null) e.times.push((m as any).response_time_seconds);
      map.set(uid, e);
    }
    for (const c of data?.resolved ?? []) {
      const uid = (c as any).assigned_to;
      if (!uid) continue;
      const e = map.get(uid) ?? { msgs: 0, convs: new Set(), times: [], resolved: 0 };
      e.resolved += 1;
      map.set(uid, e);
    }
    const green = settings?.green_seconds ?? 300;
    const list = Array.from(map.entries()).map(([uid, v]) => {
      const avg = v.times.length ? v.times.reduce((a, b) => a + b, 0) / v.times.length : null;
      const slaPct = v.times.length ? (v.times.filter((t) => t <= green).length / v.times.length) * 100 : null;
      // score simples: SLA% * 0.6 + (resolvidas * 5) + (volume * 0.2)
      const score = (slaPct ?? 0) * 0.6 + v.resolved * 5 + v.msgs * 0.2;
      return {
        uid,
        name: agents?.find((a: any) => a.id === uid)?.full_name || agents?.find((a: any) => a.id === uid)?.email || uid.slice(0, 8),
        msgs: v.msgs,
        convs: v.convs.size,
        resolved: v.resolved,
        avg,
        slaPct,
        score,
      };
    });
    return list.sort((a, b) => b.score - a.score);
  }, [data, settings, agents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking geral</CardTitle>
        <CardDescription>Score = 60% SLA + resolvidas (×5) + volume (×0,2).</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead className="text-right">Mensagens</TableHead>
              <TableHead className="text-right">Conversas</TableHead>
              <TableHead className="text-right">Resolvidas</TableHead>
              <TableHead className="text-right">Tempo médio</TableHead>
              <TableHead className="text-right">SLA</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sem dados no período.</TableCell></TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.uid}>
                <TableCell>
                  {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> : i + 1}
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">{r.msgs}</TableCell>
                <TableCell className="text-right">{r.convs}</TableCell>
                <TableCell className="text-right">{r.resolved}</TableCell>
                <TableCell className="text-right">{fmtSeconds(r.avg ?? undefined)}</TableCell>
                <TableCell className="text-right">{r.slaPct == null ? "—" : `${Math.round(r.slaPct)}%`}</TableCell>
                <TableCell className="text-right font-bold">{Math.round(r.score)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSlaSettings();
  const [green, setGreen] = useState<number>(settings?.green_seconds ?? 300);
  const [yellow, setYellow] = useState<number>(settings?.yellow_seconds ?? 900);
  const [saving, setSaving] = useState(false);

  // sync once loaded
  useMemo(() => {
    if (settings) {
      setGreen(settings.green_seconds);
      setYellow(settings.yellow_seconds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.green_seconds, settings?.yellow_seconds]);

  const save = async () => {
    if (green <= 0 || yellow <= green) {
      toast.error("Amarelo deve ser maior que verde, e ambos > 0.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sla_settings")
      .upsert({ id: 1, green_seconds: green, yellow_seconds: yellow, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error("Falha ao salvar: " + error.message);
    else {
      toast.success("Metas atualizadas");
      qc.invalidateQueries({ queryKey: [QK.sla] });
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Metas de SLA</CardTitle>
        <CardDescription>Tempo (em segundos) que define verde/amarelo/vermelho.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verde (ótimo)</label>
                <Input type="number" min={1} value={green} onChange={(e) => setGreen(Number(e.target.value))} />
                <p className="text-[11px] text-muted-foreground mt-1">{fmtSeconds(green)}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amarelo (atenção)</label>
                <Input type="number" min={1} value={yellow} onChange={(e) => setYellow(Number(e.target.value))} />
                <p className="text-[11px] text-muted-foreground mt-1">{fmtSeconds(yellow)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Horário comercial ainda não considerado — cálculo 24/7.
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar metas"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, sub, loading, highlight }: { label: string; value: string; sub?: string; loading?: boolean; highlight?: "good" | "warn" | "bad" }) {
  const tone = highlight === "good" ? "text-emerald-600" : highlight === "warn" ? "text-amber-600" : highlight === "bad" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${tone}`}>{loading ? "…" : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Stacked({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  const total = green + yellow + red || 1;
  return (
    <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
      <div className="bg-emerald-500" style={{ width: `${(green / total) * 100}%` }} />
      <div className="bg-amber-500" style={{ width: `${(yellow / total) * 100}%` }} />
      <div className="bg-red-500" style={{ width: `${(red / total) * 100}%` }} />
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}
