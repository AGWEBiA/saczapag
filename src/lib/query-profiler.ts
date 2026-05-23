// Profiler leve para queries Supabase. Mede o tempo de cada operação
// e mantém um ring buffer das últimas N execuções para inspeção no painel
// de diagnóstico. Zero impacto fora do painel.

import { supabase } from "@/integrations/supabase/client";

export type QuerySample = {
  id: number;
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert" | "rpc" | "unknown";
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
  rows?: number;
  route: string;
  timestamp: number;
};

const MAX_SAMPLES = 300;
const samples: QuerySample[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

function push(sample: QuerySample) {
  samples.unshift(sample);
  if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES;
  notify();
}

export function getSamples(): QuerySample[] {
  return samples.slice();
}

export function clearSamples() {
  samples.length = 0;
  notify();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let installed = false;

export function installQueryProfiler() {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const originalFrom = supabase.from.bind(supabase);

  (supabase as any).from = (table: string) => {
    const builder: any = originalFrom(table as any);
    const route =
      typeof window !== "undefined" ? window.location.pathname : "ssr";

    // PostgREST builders são thenable. Encapsulamos o método then
    // sem alterar a cadeia de filtros .eq/.select/etc.
    const wrap = (b: any, op: QuerySample["op"]) => {
      const originalThen = b.then?.bind(b);
      if (!originalThen) return b;
      let measured = false;
      b.then = (onFulfilled: any, onRejected: any) => {
        if (measured) return originalThen(onFulfilled, onRejected);
        measured = true;
        const start = performance.now();
        return originalThen(
          (result: any) => {
            const duration = performance.now() - start;
            push({
              id: nextId++,
              table,
              op,
              durationMs: duration,
              ok: !result?.error,
              errorMessage: result?.error?.message,
              rows: Array.isArray(result?.data)
                ? result.data.length
                : result?.data
                  ? 1
                  : 0,
              route,
              timestamp: Date.now(),
            });
            return onFulfilled ? onFulfilled(result) : result;
          },
          (err: any) => {
            const duration = performance.now() - start;
            push({
              id: nextId++,
              table,
              op,
              durationMs: duration,
              ok: false,
              errorMessage: err?.message ?? String(err),
              route,
              timestamp: Date.now(),
            });
            return onRejected ? onRejected(err) : Promise.reject(err);
          },
        );
      };
      return b;
    };

    // Detecta op a partir do método chamado
    const opMethods: Record<string, QuerySample["op"]> = {
      select: "select",
      insert: "insert",
      update: "update",
      delete: "delete",
      upsert: "upsert",
    };

    for (const method of Object.keys(opMethods)) {
      const orig = builder[method]?.bind(builder);
      if (!orig) continue;
      builder[method] = (...args: any[]) => {
        const child = orig(...args);
        return wrap(child, opMethods[method]);
      };
    }

    return builder;
  };
}
