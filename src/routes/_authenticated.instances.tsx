import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/instances")({
  component: () => <div className="p-8">Gerenciamento de Instâncias (Em breve)</div>,
});
