import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  requireAuth?: boolean;
  requireRole?: AppRole;
}

export function AppLayout({ children, requireAuth = true, requireRole }: Props) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (requireAuth && !user) {
      navigate({ to: "/login" });
      return;
    }
    if (requireRole && role && role !== requireRole) {
      navigate({ to: role === "admin" ? "/" : "/me" });
    }
  }, [loading, user, role, requireAuth, requireRole, navigate]);

  if (loading || (requireAuth && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar role={role} email={user?.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/40 backdrop-blur sticky top-0 z-10">
            <SidebarTrigger className="ml-2" />
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
