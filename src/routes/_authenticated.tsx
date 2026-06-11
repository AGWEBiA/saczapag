import { createFileRoute, redirect, Outlet, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Smartphone, Users, Settings, MessageSquare, Users2, Activity, ClipboardList, BarChart3, Menu, PanelLeftClose, PanelLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole } from "@/hooks/use-user-role";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { HelpGuide } from "@/components/shared/HelpGuide";
import { MentionNotificationHandler } from "@/components/chat/MentionNotificationHandler";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import agwebiIcon from "@/assets/agwebi-icon.png";


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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const { isAdmin } = useUserRole();

  const userNavItems: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/chat", label: "Chat WhatsApp", icon: MessageSquare },
    { to: "/contacts", label: "Contatos", icon: Users },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  ];

  const adminNavItems: NavItem[] = [
    { to: "/instances", label: "Conexões", icon: Smartphone },
    { to: "/team", label: "Equipe", icon: Users2 },
    { to: "/audit", label: "Auditoria", icon: ClipboardList },
    { to: "/diagnostics", label: "Sistema", icon: Activity },
    { to: "/settings", label: "Ajustes", icon: Settings },
  ];

  const navItems: NavItem[] = isAdmin
    ? [...userNavItems, ...adminNavItems]
    : userNavItems;

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    }
  }, [sidebarCollapsed]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <MentionNotificationHandler />

      {/* Sidebar — escondida no mobile, vira drawer */}
      <DesktopSidebar navItems={navItems} onLogout={handleLogout} collapsed={sidebarCollapsed} />

      <div className="flex-1 flex flex-col min-w-0 bg-muted/5 relative">
        {/* Top Header */}
        <header className="h-14 md:h-16 border-b bg-card/50 backdrop-blur-md flex items-center justify-between gap-2 px-3 md:px-6 lg:px-8 z-20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNav navItems={navItems} onLogout={handleLogout} />
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex h-9 w-9"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              {sidebarCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2 md:hidden min-w-0">
              <img src={agwebiIcon} alt="AG WEBi" className="w-7 h-7 object-contain shrink-0" />
              <span className="font-bold text-base truncate">
                AG <span className="text-primary">WEBi</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            <HelpGuide />
            <NotificationCenter />

            <div className="hidden md:block h-8 w-px bg-border mx-1" />

            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted/50 border border-transparent hover:border-border transition-colors group cursor-pointer max-w-[200px]">
              <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase shadow-sm">
                {user?.email?.charAt(0) || "U"}
              </div>
              <div className="hidden lg:block min-w-0">
                <div className="text-xs font-bold leading-none truncate">{user?.email?.split("@")[0]}</div>
                <div className="text-[10px] text-green-500 font-medium">Online</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="h-full animate-in fade-in zoom-in-95 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

function DesktopSidebar({ navItems, onLogout, collapsed }: { navItems: NavItem[]; onLogout: () => void; collapsed?: boolean }) {
  const asideCls = collapsed
    ? "hidden md:flex w-20 border-r bg-card flex-col transition-all duration-300 z-30 shrink-0"
    : "hidden md:flex w-20 lg:w-64 border-r bg-card flex-col transition-all duration-300 z-30 shrink-0";
  const labelCls = collapsed ? "hidden" : "hidden lg:inline";
  const tooltipCls = collapsed
    ? "absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl border"
    : "lg:hidden absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl border";
  const logoutLabelCls = collapsed ? "hidden" : "hidden lg:inline font-medium";
  const logoutBtnCls = collapsed
    ? "w-full justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl px-3 min-h-[44px]"
    : "w-full justify-center lg:justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl px-3 min-h-[44px]";
  const logoutIconCls = collapsed ? "h-5 w-5 shrink-0" : "h-5 w-5 lg:mr-3 shrink-0";

  return (
    <aside className={asideCls}>
      <div className="p-4 lg:p-6 border-b flex flex-col items-center lg:items-start overflow-hidden">
        <div className="flex items-center gap-2.5">
          <img src={agwebiIcon} alt="AG WEBi" className="w-9 h-9 object-contain shrink-0" />
          <span className={collapsed ? "hidden" : "hidden lg:inline font-bold text-lg tracking-tight text-foreground"}>
            AG <span className="text-primary">WEBi</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            preload="intent"
            className="flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-accent group relative min-h-[44px]"
            activeProps={{ className: "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-semibold" }}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className={labelCls}>{item.label}</span>
            <div className={tooltipCls}>
              {item.label}
            </div>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className={logoutBtnCls}
          onClick={onLogout}
        >
          <LogOut className={logoutIconCls} />
          <span className={logoutLabelCls}>Sair</span>
        </Button>
      </div>
    </aside>
  );
}

function MobileNav({ navItems, onLogout }: { navItems: NavItem[]; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Fecha o drawer ao navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-10 w-10"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 max-w-[85vw] flex flex-col">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <SheetDescription className="sr-only">Links principais do sistema</SheetDescription>
        <div className="p-5 border-b flex items-center gap-2.5">
          <img src={agwebiIcon} alt="AG WEBi" className="w-9 h-9 object-contain" />
          <span className="font-bold text-lg tracking-tight">
            AG <span className="text-primary">WEBi</span>
          </span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-accent min-h-[44px]"
              activeProps={{ className: "bg-primary text-primary-foreground shadow-md font-semibold" }}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl px-3 min-h-[44px]"
            onClick={onLogout}
          >
            <LogOut className="h-5 w-5 mr-3" />
            <span className="font-medium">Sair</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
