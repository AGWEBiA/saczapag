import { createFileRoute } from "@tanstack/react-router";
import { InstanceList } from "@/components/instances/InstanceList";
import { instancesQueryOptions } from "@/lib/queries/instances";

export const Route = createFileRoute("/_authenticated/instances")({
  loader: ({ context }) => {
    if (typeof window === "undefined") return;
    return context.queryClient.ensureQueryData(instancesQueryOptions);
  },
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
