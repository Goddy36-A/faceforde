import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <AppLayout requireRole="admin">
      <AnalyticsPage />
    </AppLayout>
  ),
});

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AnalyticsPage() {
  const [daily, setDaily] = useState<{ date: string; count: number }[]>([]);
  const [topEmps, setTopEmps] = useState<{ name: string; hours: number }[]>([]);
  const [deptTrend, setDeptTrend] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      // 30 day daily attendance
      const end = new Date();
      const start30 = new Date();
      start30.setDate(end.getDate() - 29);
      const { data: logs30 } = await supabase
        .from("attendance_logs")
        .select("date, status")
        .gte("date", fmtDate(start30))
        .lte("date", fmtDate(end));
      const dayMap = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(start30);
        d.setDate(start30.getDate() + i);
        dayMap.set(fmtDate(d), 0);
      }
      (logs30 ?? []).forEach((l) => {
        if (l.status === "present" || l.status === "late") {
          dayMap.set(l.date, (dayMap.get(l.date) ?? 0) + 1);
        }
      });
      setDaily(Array.from(dayMap.entries()).map(([date, count]) => ({ date: date.slice(5), count })));

      // Top 10 employees by hours this month
      const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
      const { data: monthLogs } = await supabase
        .from("attendance_logs")
        .select("employee_id, hours_worked, employees(full_name)")
        .gte("date", fmtDate(monthStart))
        .lte("date", fmtDate(end));
      const empHours = new Map<string, number>();
      (monthLogs ?? []).forEach((l: any) => {
        const name = l.employees?.full_name ?? "Unknown";
        empHours.set(name, (empHours.get(name) ?? 0) + Number(l.hours_worked ?? 0));
      });
      setTopEmps(
        Array.from(empHours.entries())
          .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 10),
      );

      // Department-wise attendance rate over 4 weeks
      const start4w = new Date();
      start4w.setDate(end.getDate() - 27);
      const { data: emps } = await supabase.from("employees").select("id, department");
      const { data: logs4w } = await supabase
        .from("attendance_logs")
        .select("date, status, employee_id, employees(department)")
        .gte("date", fmtDate(start4w))
        .lte("date", fmtDate(end));
      const depts = Array.from(new Set((emps ?? []).map((e) => e.department))).sort();
      setDepartments(depts);
      // Group by week (4 buckets of 7 days)
      const weeks: any[] = [];
      for (let w = 0; w < 4; w++) {
        const wStart = new Date(start4w);
        wStart.setDate(start4w.getDate() + w * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        const row: any = { week: `W${w + 1}` };
        depts.forEach((dep) => {
          const empsInDep = (emps ?? []).filter((e) => e.department === dep);
          const totalSlots = empsInDep.length * 7;
          const attended = (logs4w ?? []).filter((l: any) => {
            const d = new Date(l.date);
            return (
              d >= wStart && d <= wEnd && l.employees?.department === dep && (l.status === "present" || l.status === "late")
            );
          }).length;
          row[dep] = totalSlots > 0 ? Math.round((attended / totalSlots) * 1000) / 10 : 0;
        });
        weeks.push(row);
      }
      setDeptTrend(weeks);
    };
    load();
  }, []);

  const chartColors = ["#3FBADF", "#5BD09B", "#F2C462", "#B68BE5", "#E58F8F"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Insights from real attendance data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Attendance — Past 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartShell>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 30% / 0.4)" />
              <XAxis dataKey="date" stroke="hsl(220 10% 70%)" fontSize={11} />
              <YAxis stroke="hsl(220 10% 70%)" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#3FBADF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartShell>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Employees by Hours — This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartShell>
            <BarChart data={topEmps} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 30% / 0.4)" />
              <XAxis type="number" stroke="hsl(220 10% 70%)" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="hsl(220 10% 70%)" fontSize={11} width={100} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="hours" fill="#5BD09B" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartShell>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Department Attendance Rate — Last 4 Weeks (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartShell>
            <LineChart data={deptTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 30% / 0.4)" />
              <XAxis dataKey="week" stroke="hsl(220 10% 70%)" fontSize={11} />
              <YAxis stroke="hsl(220 10% 70%)" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {departments.map((dep, i) => (
                <Line key={dep} dataKey={dep} stroke={chartColors[i % chartColors.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ChartShell>
        </CardContent>
      </Card>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(220 15% 15%)",
  border: "1px solid hsl(220 15% 30%)",
  borderRadius: 8,
  fontSize: 12,
};

function ChartShell({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}
