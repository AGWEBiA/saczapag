import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => <div className="p-8">Configurações do Sistema (Em breve)</div>,
});
