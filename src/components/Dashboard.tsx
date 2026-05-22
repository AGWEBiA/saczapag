import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  MessageSquare,
  Users,
  Smartphone,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export function Dashboard() {
  const { data: instances } = useQuery({
    queryKey: ["dash_instances"],
    staleTime: 1000 * 60 * 60, // 1h
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_instances").select("id, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["dash_contacts"],
    staleTime: 1000 * 60 * 60 * 2, // 2h
    queryFn: async () => {
      // Usando query otimizada apenas para contagem
      const { count, error } = await supabase
        .from("contacts")
        .select("*", { count: 'estimated', head: true });
      if (error) throw error;
      return { length: count || 0 };
    },
  });

  const { data: conversations } = useQuery({
    queryKey: ["dash_conversations"],
    staleTime: 1000 * 60 * 30, // 30 min
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id, status, assigned_to");
      if (error) throw error;
      return data;
    },
  });

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ["dash_messages_7d"],
    staleTime: 1000 * 60 * 60, // 1h
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(1000); 
      if (error) throw error;
      return data;
    },
  });

  const isLoading = !instances || !contacts || !conversations || loadingMsgs;

  const stats = useMemo(() => {
    const activeInstances = instances?.filter((i) => i.status === "connected").length || 0;
    const totalInstances = instances?.length || 0;
    const totalContacts = contacts?.length || 0;
    const open = conversations?.filter((c) => c.status === "aberta").length || 0;
    const unassigned = conversations?.filter((c) => !c.assigned_to).length || 0;
    const closed = conversations?.filter((c) => c.status !== "aberta").length || 0;
    return { activeInstances, totalInstances, totalContacts, open, unassigned, closed };
  }, [instances, contacts, conversations]);

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = startOfDay(subDays(new Date(), 6 - i));
      return {
        date: d,
        label: format(d, "EEE", { locale: ptBR }),
        recebidas: 0,
        enviadas: 0,
      };
    });
    messages?.forEach((m) => {
      const day = startOfDay(new Date(m.created_at));
      const bucket = days.find((d) => d.date.getTime() === day.getTime());
      if (!bucket) return;
      if (m.direction === "inbound") bucket.recebidas++;
      else bucket.enviadas++;
    });
    return days;
  }, [messages]);

  const funnelData = useMemo(
    () => [
      { name: "Não Atribuídas", value: stats.unassigned },
      { name: "Em Atendimento", value: Math.max(stats.open - stats.unassigned, 0) },
      { name: "Finalizadas", value: stats.closed },
    ],
    [stats]
  );

  const FUNNEL_COLORS = ["hsl(var(--destructive))", "hsl(var(--primary))", "hsl(var(--muted-foreground))"];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel Multicanal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão centralizada do seu atendimento — últimos 7 dias
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Instâncias Conectadas"
          value={`${stats.activeInstances}/${stats.totalInstances}`}
          icon={Smartphone}
          hint="Canais WhatsApp ativos"
        />
        <KpiCard
          title="Atendimentos Abertos"
          value={stats.open}
          icon={Inbox}
          hint="Conversas em andamento"
        />
        <KpiCard
          title="Aguardando Agente"
          value={stats.unassigned}
          icon={Clock}
          hint="Sem atribuição"
          accent={stats.unassigned > 0 ? "destructive" : undefined}
        />
        <KpiCard
          title="Contatos Totais"
          value={stats.totalContacts}
          icon={Users}
          hint="Base sincronizada"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Volume de Mensagens
            </CardTitle>
            <CardDescription>Recebidas vs Enviadas nos últimos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="recv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="recebidas"
                    stroke="hsl(var(--primary))"
                    fill="url(#recv)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="enviadas"
                    stroke="hsl(var(--muted-foreground))"
                    fill="url(#sent)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Funil de Atendimento
            </CardTitle>
            <CardDescription>Distribuição por status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={funnelData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {funnelData.map((_, i) => (
                      <Cell key={i} fill={FUNNEL_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Atividade Diária
          </CardTitle>
          <CardDescription>Total de mensagens trocadas por dia</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="recebidas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="enviadas" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {(!instances || instances.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Comece agora</CardTitle>
            <CardDescription>
              Conecte sua primeira instância do WhatsApp para começar a centralizar atendimentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/instances">
                <Plus className="mr-2 h-4 w-4" /> Configurar Instância
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  hint,
  accent,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  accent?: "destructive";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${accent === "destructive" ? "text-destructive" : "text-primary"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent === "destructive" ? "text-destructive" : ""}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}
