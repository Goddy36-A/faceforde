import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, CheckCircle2, XCircle, Clock } from "lucide-react";
import { todayDateString } from "@/lib/attendance";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  component: () => (
    <AppLayout requireRole="admin">
      <DashboardPage />
    </AppLayout>
  ),
});

interface Stats {
  total: number;
  present: number;
  late: number;
  absent: number;
}
interface FeedRow {
  id: string;
  name: string;
  department: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
}

function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total: 0, present: 0, late: 0, absent: 0 });
  const [feed, setFeed] = useState<FeedRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const today = todayDateString();
      const { data: emps } = await supabase.from("employees").select("id, full_name, department");
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("id, employee_id, check_in_time, check_out_time, status, employees(full_name, department)")
        .eq("date", today)
        .order("check_in_time", { ascending: false });
      const total = emps?.length ?? 0;
      const present = logs?.filter((l) => l.status === "present").length ?? 0;
      const late = logs?.filter((l) => l.status === "late").length ?? 0;
      const checkedInIds = new Set(logs?.map((l) => l.employee_id) ?? []);
      const absent = (emps ?? []).filter((e) => !checkedInIds.has(e.id)).length;
      setStats({ total, present, late, absent });
      setFeed(
        (logs ?? []).map((l: any) => ({
          id: l.id,
          name: l.employees?.full_name ?? "Unknown",
          department: l.employees?.department ?? "—",
          check_in_time: l.check_in_time,
          check_out_time: l.check_out_time,
          status: l.status,
        })),
      );
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time attendance overview for {todayDateString()}.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={stats.total} icon={Users} tone="primary" />
        <StatCard label="Present Today" value={stats.present} icon={CheckCircle2} tone="success" />
        <StatCard label="Late Today" value={stats.late} icon={Clock} tone="warning" />
        <StatCard label="Absent Today" value={stats.absent} icon={XCircle} tone="destructive" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Today's Attendance Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet today.</p>
          ) : (
            <div className="divide-y divide-border">
              {feed.map((f) => (
                <div key={f.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{f.department}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">In</p>
                      <p className="text-sm font-mono">{f.check_in_time ? new Date(f.check_in_time).toLocaleTimeString() : "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Out</p>
                      <p className="text-sm font-mono">{f.check_out_time ? new Date(f.check_out_time).toLocaleTimeString() : "—"}</p>
                    </div>
                    <StatusBadge status={f.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: "primary" | "success" | "warning" | "destructive" }) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary/15 text-primary ring-primary/30",
    success: "bg-success/15 text-success ring-success/30",
    warning: "bg-warning/15 text-warning ring-warning/30",
    destructive: "bg-destructive/15 text-destructive ring-destructive/30",
  };
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold mt-1">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ring-1 ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: "bg-success/15 text-success border-success/30",
    late: "bg-warning/15 text-warning border-warning/30",
    absent: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}
