import { createFileRoute } from "@tanstack/react-router";
import { SettingsInterface } from "@/components/settings/SettingsInterface";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie seu perfil, preferências e integrações do sistema.
        </p>
      </div>
      <SettingsInterface />
    </div>
  ),
});

