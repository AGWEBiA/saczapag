import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Smartphone, Users, Settings, MessageSquare, Users2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    // getSession is much faster as it uses the local cache if available
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const { user } = Route.useRouteContext();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.invalidate();
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/chat", label: "Chat", icon: MessageSquare },
    { to: "/instances", label: "Instâncias", icon: Smartphone },
    { to: "/contacts", label: "Contatos", icon: Users },
    { to: "/team", label: "Equipe", icon: Users2 },
    { to: "/settings", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <div className="font-bold text-xl tracking-tight text-primary">AG SAC</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">{user?.email}</div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent group"
              activeProps={{ className: "bg-primary/10 text-primary font-medium" }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>
      
      <main className="flex-1 overflow-auto bg-muted/10 p-8">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
