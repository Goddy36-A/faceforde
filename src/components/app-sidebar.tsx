import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  ScanFace,
  FileBarChart,
  TrendingUp,
  User,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";

interface AppSidebarProps {
  role: AppRole | null;
  email: string | undefined;
}

export function AppSidebar({ role, email }: AppSidebarProps) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const adminItems = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Employees", url: "/employees", icon: Users },
    { title: "Check-in", url: "/checkin", icon: ScanFace },
    { title: "Reports", url: "/reports", icon: FileBarChart },
    { title: "Analytics", url: "/analytics", icon: TrendingUp },
  ];
  const employeeItems = [
    { title: "My Attendance", url: "/me", icon: User },
    { title: "Check-in", url: "/checkin", icon: ScanFace },
  ];
  const items = role === "admin" ? adminItems : employeeItems;

  const isActive = (url: string) => (url === "/" ? path === "/" : path.startsWith(url));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/20 flex items-center justify-center ring-1 ring-primary/40">
            <ScanFace className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">FaceID HR</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {role ?? "guest"}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 gap-2">
        <p className="text-xs text-muted-foreground truncate px-2">{email}</p>
        <Button variant="outline" size="sm" onClick={handleLogout} className="w-full justify-start gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
