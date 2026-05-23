import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  getSamples,
  subscribe,
  clearSamples,
  type QuerySample,
} from "@/lib/query-profiler";

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

function DiagnosticsPage() {
  const [samples, setSamples] = useState<QuerySample[]>(() => getSamples());
  const [minMs, setMinMs] = useState(0);
  const [tableFilter, setTableFilter] = useState("");

  useEffect(() => {
    return subscribe(() => setSamples(getSamples()));
  }, []);

  const filtered = useMemo(
    () =>
      samples.filter(
        (s) =>
          s.durationMs >= minMs &&
          (!tableFilter ||
            s.table.toLowerCase().includes(tableFilter.toLowerCase())),
      ),
    [samples, minMs, tableFilter],
  );

  const durations = filtered.map((s) => s.durationMs);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);

  const byTable = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const s of filtered) {
      const cur = map.get(s.table) ?? { count: 0, total: 0 };
      cur.count++;
      cur.total += s.durationMs;
      map.set(s.table, cur);
    }
    return [...map.entries()]
      .map(([table, v]) => ({
        table,
        count: v.count,
        avg: v.total / v.count,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(samples, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-samples-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Diagnóstico de Performance
        </h1>
        <p className="text-muted-foreground">
          Tempo de cada consulta ao Supabase desde que esta sessão começou.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              Amostras
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {filtered.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              p50
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {p50.toFixed(0)} ms
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              p95
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {p95.toFixed(0)} ms
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              p99
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {p99.toFixed(0)} ms
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo por tabela</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabela</TableHead>
                <TableHead className="text-right">Queries</TableHead>
                <TableHead className="text-right">Média (ms)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byTable.map((row) => (
                <TableRow key={row.table}>
                  <TableCell className="font-medium">{row.table}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right">
                    {row.avg.toFixed(0)}
                  </TableCell>
                </TableRow>
              ))}
              {byTable.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-4"
                  >
                    Nenhuma amostra. Navegue pelo sistema para coletar dados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Queries individuais</CardTitle>
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Filtrar tabela..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="h-8 w-40"
            />
            <Input
              type="number"
              placeholder="≥ ms"
              value={minMs || ""}
              onChange={(e) => setMinMs(Number(e.target.value) || 0)}
              className="h-8 w-24"
            />
            <Button size="sm" variant="outline" onClick={exportJson}>
              Exportar
            </Button>
            <Button size="sm" variant="outline" onClick={clearSamples}>
              Limpar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tabela</TableHead>
                <TableHead>Op</TableHead>
                <TableHead className="text-right">ms</TableHead>
                <TableHead className="text-right">Linhas</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.timestamp).toLocaleTimeString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">{s.table}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.op}</Badge>
                  </TableCell>
                  <TableCell
                    className={
                      "text-right font-mono " +
                      (s.durationMs > 800
                        ? "text-destructive font-bold"
                        : s.durationMs > 400
                          ? "text-orange-500"
                          : "")
                    }
                  >
                    {s.durationMs.toFixed(0)}
                  </TableCell>
                  <TableCell className="text-right">{s.rows ?? "-"}</TableCell>
                  <TableCell className="text-xs">{s.route}</TableCell>
                  <TableCell>
                    {s.ok ? (
                      <Badge variant="secondary">ok</Badge>
                    ) : (
                      <Badge variant="destructive" title={s.errorMessage}>
                        erro
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/diagnostics")({
  component: DiagnosticsPage,
});
