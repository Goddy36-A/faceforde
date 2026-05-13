import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./index";

export const Route = createFileRoute("/me")({
  component: () => (
    <AppLayout>
      <MePage />
    </AppLayout>
  ),
});

interface Log {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number | null;
  status: string;
}

function MePage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [empName, setEmpName] = useState("");
  const [stats, setStats] = useState({ rate: 0, hours: 0, punctuality: 0 });
  const [monthly, setMonthly] = useState<{ date: string; hours: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let { data: emp } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!emp && user.email) {
        // Backfill: link by email
        const { data: byEmail } = await supabase
          .from("employees")
          .select("id, full_name")
          .eq("email", user.email)
          .maybeSingle();
        if (byEmail) {
          await supabase.from("employees").update({ user_id: user.id }).eq("id", byEmail.id);
          emp = byEmail;
        }
      }
      if (!emp) return;
      setEmpName(emp.full_name);
      const { data } = await supabase
        .from("attendance_logs")
        .select("id, date, check_in_time, check_out_time, hours_worked, status")
        .eq("employee_id", emp.id)
        .order("date", { ascending: false })
        .limit(60);
      const list = data ?? [];
      setLogs(list);
      const totalHours = list.reduce((s, l) => s + Number(l.hours_worked ?? 0), 0);
      const presentCount = list.filter((l) => l.status === "present").length;
      const attended = list.filter((l) => l.status === "present" || l.status === "late").length;
      setStats({
        rate: list.length ? Math.round((attended / list.length) * 1000) / 10 : 0,
        hours: Math.round(totalHours * 100) / 100,
        punctuality: attended ? Math.round((presentCount / attended) * 1000) / 10 : 0,
      });
      // Monthly bar chart - this month per day
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const days: { date: string; hours: number }[] = [];
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        const key = d.toISOString().slice(0, 10);
        const log = list.find((l) => l.date === key);
        days.push({ date: String(i), hours: Number(log?.hours_worked ?? 0) });
      }
      setMonthly(days);
    };
    load();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Attendance</h1>
        <p className="text-sm text-muted-foreground">{empName ? `Hi ${empName.split(" ")[0]} — your personal dashboard.` : "Your personal dashboard."}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Attendance rate" value={`${stats.rate}%`} />
        <Stat label="Total hours" value={String(stats.hours)} />
        <Stat label="Punctuality score" value={`${stats.punctuality}%`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Hours Worked — This Month</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 30% / 0.4)" />
                <XAxis dataKey="date" stroke="hsl(220 10% 70%)" fontSize={11} />
                <YAxis stroke="hsl(220 10% 70%)" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(220 15% 15%)", border: "1px solid hsl(220 15% 30%)", borderRadius: 8 }} />
                <Bar dataKey="hours" fill="#3FBADF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.date}</TableCell>
                  <TableCell>{l.check_in_time ? new Date(l.check_in_time).toLocaleTimeString() : "—"}</TableCell>
                  <TableCell>{l.check_out_time ? new Date(l.check_out_time).toLocaleTimeString() : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{l.hours_worked ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No history yet — head to Check-in.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
