import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: () => <div className="p-8">Lista de Contatos (Em breve)</div>,
});
