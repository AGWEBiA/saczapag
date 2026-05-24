import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Smartphone, Users, Settings, MessageSquare, Users2, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") {
      return { user: null };
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const { user: initialUser } = Route.useRouteContext();
  const { user: authUser, isAuthenticated, isLoading } = useAuth();

  const user = authUser || initialUser;

  // Segunda camada de proteção em efeito (sem early-return para não quebrar hidratação)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/chat", label: "Chat", icon: MessageSquare },
    { to: "/instances", label: "Instâncias", icon: Smartphone },
    { to: "/contacts", label: "Contatos", icon: Users },
    { to: "/team", label: "Equipe", icon: Users2 },
    { to: "/diagnostics", label: "Diagnóstico", icon: Activity },
    { to: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-20 lg:w-64 border-r bg-card flex flex-col transition-all duration-300">
        <div className="p-4 lg:p-6 border-b flex flex-col items-center lg:items-start overflow-hidden">
          <div className="font-bold text-xl tracking-tighter text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 shrink-0">
              AG
            </div>
            <span className="hidden lg:inline animate-in fade-in slide-in-from-left-2">SAC</span>
          </div>
          <div className="hidden lg:block text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest mt-4">
            Sistema de Atendimento
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              className="flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-accent group relative"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-semibold" }}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
              
              {/* Tooltip para mobile */}
              <div className="lg:hidden absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl border">
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t space-y-4">
          <div className="hidden lg:flex items-center gap-3 px-2 py-2 rounded-xl bg-muted/50 border border-transparent hover:border-border transition-colors group cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
              {user?.email?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate leading-none mb-1">{user?.email?.split("@")[0]}</div>
              <div className="text-[10px] text-muted-foreground truncate leading-none">Status: Online</div>
            </div>
          </div>
          
          <Button
            variant="ghost"
            className="w-full justify-center lg:justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl px-3"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 lg:mr-3 shrink-0" />
            <span className="hidden lg:inline font-medium">Sair</span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto bg-muted/5 relative">
        <div className="h-full flex flex-col p-4 lg:p-8 overflow-auto animate-in fade-in zoom-in-95 duration-500">
          <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
