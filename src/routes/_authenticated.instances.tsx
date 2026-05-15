import { createFileRoute } from "@tanstack/react-router";
import { InstanceList } from "@/components/instances/InstanceList";

export const Route = createFileRoute("/_authenticated/instances")({
  component: () => (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Instâncias</h1>
        <p className="text-muted-foreground">
          Gerencie suas conexões do WhatsApp e visualize o status de cada instância.
        </p>
      </div>
      <InstanceList />
    </div>
  ),
});

