import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Smartphone, Users, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Placeholder */}
      <aside className="w-64 border-r bg-muted/30 p-4">
        <div className="mb-8 font-bold text-xl">AG SAC</div>
        <nav className="space-y-2">
          <Link to="/dashboard" className="block p-2 rounded hover:bg-accent transition-colors" activeProps={{ className: "bg-accent font-medium" }}>Dashboard</Link>
          <Link to="/instances" className="block p-2 rounded hover:bg-accent transition-colors" activeProps={{ className: "bg-accent font-medium" }}>Instâncias</Link>
          <Link to="/contacts" className="block p-2 rounded hover:bg-accent transition-colors" activeProps={{ className: "bg-accent font-medium" }}>Contatos</Link>
          <Link to="/settings" className="block p-2 rounded hover:bg-accent transition-colors" activeProps={{ className: "bg-accent font-medium" }}>Configurações</Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
