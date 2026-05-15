import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Painel de Atendimento</h1>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Conversas Ativas</h3>
          <p className="mt-2 text-2xl font-bold">0</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Instâncias Conectadas</h3>
          <p className="mt-2 text-2xl font-bold">0</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Contatos Salvos</h3>
          <p className="mt-2 text-2xl font-bold">0</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-12 text-center shadow-sm">
        <h2 className="text-xl font-semibold">Nenhuma conversa por aqui</h2>
        <p className="mt-2 text-muted-foreground">
          Conecte uma instância do WhatsApp na aba "Instâncias" para começar a receber mensagens.
        </p>
      </div>
    </div>
  );
}
