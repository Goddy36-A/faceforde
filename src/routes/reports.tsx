import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <AppLayout requireRole="admin">
      <ReportsPage />
    </AppLayout>
  ),
});

interface Row {
  employee_id: string;
  name: string;
  department: string;
  present: number;
  absent: number;
  late: number;
  hours: number;
  rate: number;
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function ReportsPage() {
  const [{ start, end }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, department");
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("employee_id, status, hours_worked, date")
        .gte("date", start)
        .lte("date", end);

      // Total weekdays (rough: count all dates in range)
      const startD = new Date(start);
      const endD = new Date(end);
      const totalDays = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1);

      const byEmp = new Map<string, Row>();
      (emps ?? []).forEach((e) =>
        byEmp.set(e.id, { employee_id: e.id, name: e.full_name, department: e.department, present: 0, absent: 0, late: 0, hours: 0, rate: 0 }),
      );
      (logs ?? []).forEach((l) => {
        const r = byEmp.get(l.employee_id);
        if (!r) return;
        if (l.status === "present") r.present++;
        else if (l.status === "late") r.late++;
        r.hours += Number(l.hours_worked ?? 0);
      });
      const final = Array.from(byEmp.values()).map((r) => {
        const attended = r.present + r.late;
        r.absent = Math.max(0, totalDays - attended);
        r.rate = totalDays > 0 ? Math.round((attended / totalDays) * 1000) / 10 : 0;
        r.hours = Math.round(r.hours * 100) / 100;
        return r;
      });
      setRows(final);
    };
    load();
  }, [start, end]);

  const csv = useMemo(() => {
    const header = ["Name", "Department", "Present", "Late", "Absent", "Hours Worked", "Attendance Rate %"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push([r.name, r.department, r.present, r.late, r.absent, r.hours, r.rate].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    });
    return lines.join("\n");
  }, [rows]);

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${start}_to_${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Attendance summary by employee.</p>
        </div>
        <Button onClick={download} variant="outline"><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="s">Start</Label>
              <Input id="s" type="date" value={start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="e">End</Label>
              <Input id="e" type="date" value={end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Late</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employee_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell className="text-right">{r.present}</TableCell>
                  <TableCell className="text-right">{r.late}</TableCell>
                  <TableCell className="text-right">{r.absent}</TableCell>
                  <TableCell className="text-right">{r.hours}</TableCell>
                  <TableCell className="text-right font-mono">{r.rate}%</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
