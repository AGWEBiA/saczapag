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
  AlertCircle,
  CheckSquare,
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
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";


export function Dashboard() {
  const { user } = useAuth();
  
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

  const { data: tasks } = useQuery({
    queryKey: ["dash_tasks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("tasks" as any)
        .select("*")
        .eq("created_by", user.id)
        .eq("status", "todo")
        .limit(5);
      return data || [];
    },
    enabled: !!user,
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
    <div className="space-y-6 pb-8 p-4 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard da Agência</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe o desempenho do time e as interações no WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full">
            Exportar Relatório
          </Button>
          <Button size="sm" className="rounded-full shadow-lg shadow-primary/20">
            Nova Campanha
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Canais WhatsApp"
          value={`${stats.activeInstances}/${stats.totalInstances}`}
          icon={Smartphone}
          hint="Instâncias conectadas"
        />
        <KpiCard
          title="Inbox Aberta"
          value={stats.open}
          icon={Inbox}
          hint="Aguardando fechamento"
        />
        <KpiCard
          title="Sem Atribuição"
          value={stats.unassigned}
          icon={Clock}
          hint="Novos leads pendentes"
          accent={stats.unassigned > 0 ? "destructive" : undefined}
        />
        <KpiCard
          title="Contatos Ativos"
          value={stats.totalContacts}
          icon={Users}
          hint="Base total sincronizada"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Charts Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Engajamento (7 dias)
            </CardTitle>
            <CardDescription>Volume de mensagens inbound vs outbound</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="recv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="recebidas"
                    stroke="hsl(var(--primary))"
                    fill="url(#recv)"
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="enviadas"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="5 5"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tasks & Notifications Sidebar */}
        <div className="space-y-6">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckSquare className="h-5 w-5 text-primary" />
                Minhas Tarefas
              </CardTitle>
              <CardDescription>Criadas a partir de conversas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {tasks?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-xs">Tudo limpo por aqui!</p>
                  </div>
                ) : (
                  tasks?.map((task: any) => (
                    <div key={task.id} className="group flex items-start gap-3 p-3 rounded-xl border bg-card/50 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="mt-0.5 h-4 w-4 rounded border border-primary/50 flex items-center justify-center shrink-0 group-hover:bg-primary/10">
                        <CheckCircle2 className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate leading-none mb-1">{task.title}</div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {task.description}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:text-primary h-8" asChild>
                  <Link to="/chat">Ver todas as tarefas no Chat</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Funil de Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={funnelData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                  >
                    {funnelData.map((_, i) => (
                      <Cell key={i} fill={FUNNEL_COLORS[i]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Últimas Atualizações do WhatsApp</CardTitle>
            <CardDescription>Mensagens mais recentes em grupos e 1:1</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="space-y-4">
                <p className="text-sm text-muted-foreground italic">Integração ativa com Evolution API v2.0</p>
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-700 text-xs font-medium">
                  <Smartphone className="h-4 w-4" />
                  Todas as instâncias operando normalmente.
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
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
    <Card className="border-none shadow-md bg-card/60 backdrop-blur-sm overflow-hidden relative group">
      <div className={cn("absolute top-0 left-0 w-1 h-full", accent === "destructive" ? "bg-red-500" : "bg-primary")} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground/70">{title}</CardTitle>
        <div className={cn("p-2 rounded-lg", accent === "destructive" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-black tracking-tighter", accent === "destructive" ? "text-red-600" : "text-foreground")}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{hint}</p>
      </CardContent>
    </Card>
  );
}
