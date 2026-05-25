import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Row = {
  id: string;
  content: string | null;
  created_at: string;
  evolution_message_id: string | null;
  metadata: Record<string, unknown> | null;
  conversation: {
    id: string;
    is_group: boolean;
    contact: { name: string | null; phone_number: string } | null;
    instance: { name: string; evolution_instance_name: string } | null;
  } | null;
};

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function statusBadge(status?: string) {
  const s = String(status ?? "unknown").toLowerCase();
  const cls =
    s === "sent"
      ? "bg-green-500/15 text-green-600 border-green-500/30"
      : s === "failed"
        ? "bg-destructive/15 text-destructive border-destructive/30"
        : s === "pending"
          ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30"
          : s === "sending" || s === "queued"
            ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
            : "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cls}>{s}</Badge>;
}

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyGroups, setOnlyGroups] = useState(true);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("messages")
      .select(
        "id, content, created_at, evolution_message_id, metadata, conversation:conversations(id, is_group, contact:contacts(name, phone_number), instance:whatsapp_instances(name, evolution_instance_name))",
      )
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data } = await query;
    let list = (data as unknown as Row[]) ?? [];
    if (onlyGroups) list = list.filter((r) => r.conversation?.is_group);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyGroups]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Auditoria de Envios</h1>
          <p className="text-muted-foreground">
            Últimas 100 mensagens outbound com delivery_status, evolution_message_id, request_id e
            timestamps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={onlyGroups ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyGroups((v) => !v)}
          >
            {onlyGroups ? "Mostrando: Grupos" : "Mostrando: Todos"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Quando</th>
              <th className="text-left p-3">Destino</th>
              <th className="text-left p-3">Instância</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Conteúdo</th>
              <th className="text-left p-3">evolution_message_id</th>
              <th className="text-left p-3">request_id</th>
              <th className="text-left p-3">Erro / Nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  {loading ? "Carregando..." : "Nenhum envio encontrado."}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const md = (r.metadata ?? {}) as Record<string, unknown>;
              const status = (md.delivery_status as string) ?? "—";
              const reqId = (md.request_id as string) ?? "—";
              const err = (md.error as string) ?? (md.note as string) ?? "";
              const contact = r.conversation?.contact;
              const dest = contact?.name
                ? `${contact.name} (${contact.phone_number})`
                : contact?.phone_number ?? "—";
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3">
                    {r.conversation?.is_group && (
                      <Badge variant="secondary" className="mr-1">grupo</Badge>
                    )}
                    {dest}
                  </td>
                  <td className="p-3 text-xs">
                    {r.conversation?.instance?.evolution_instance_name ?? "—"}
                  </td>
                  <td className="p-3">{statusBadge(status)}</td>
                  <td className="p-3 max-w-[220px] truncate" title={r.content ?? ""}>
                    {r.content}
                  </td>
                  <td className="p-3 text-[11px] font-mono break-all max-w-[180px]">
                    {r.evolution_message_id ?? "—"}
                  </td>
                  <td className="p-3 text-[11px] font-mono break-all max-w-[180px]">{reqId}</td>
                  <td className="p-3 text-xs text-destructive max-w-[260px]">{err}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
