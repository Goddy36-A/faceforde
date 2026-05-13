import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { getDescriptorFromImage } from "@/lib/face-api";

export const Route = createFileRoute("/employees")({
  component: () => (
    <AppLayout requireRole="admin">
      <EmployeesPage />
    </AppLayout>
  ),
});

interface Employee {
  id: string;
  full_name: string;
  email: string;
  department: string;
  position: string;
  photo_url: string | null;
}

function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, email, department, position, photo_url")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setEmployees(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = employees.filter(
    (e) =>
      (e.full_name.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase())) &&
      (department === "" || e.department.toLowerCase().includes(department.toLowerCase())),
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this employee and their attendance history?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Employee deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage employee records and reference faces.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add employee</Button>
          </DialogTrigger>
          <AddEmployeeDialog onSaved={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Input className="max-w-[200px]" placeholder="Filter department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Face</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={e.photo_url ?? undefined} />
                        <AvatarFallback>{e.full_name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{e.full_name}</p>
                        <p className="text-xs text-muted-foreground">{e.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{e.department}</TableCell>
                  <TableCell>{e.position}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{e.photo_url ? "Enrolled" : "—"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No employees yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AddEmployeeDialog({ onSaved }: { onSaved: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Upload a clear face photo");
    setSaving(true);
    try {
      // Compute descriptor in browser
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await new Promise((res, rej) => {
        img.onload = () => res(null);
        img.onerror = rej;
      });
      const descriptor = await getDescriptorFromImage(img);
      URL.revokeObjectURL(url);
      if (!descriptor) {
        toast.error("No face detected in photo. Try another image.");
        setSaving(false);
        return;
      }

      // Upload photo
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("employee-photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("employee-photos").getPublicUrl(path);

      const { error: insErr } = await supabase.from("employees").insert({
        full_name: fullName,
        email,
        department,
        position,
        photo_url: pub.publicUrl,
        face_descriptor: Array.from(descriptor),
      });
      if (insErr) throw insErr;
      toast.success("Employee added");
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add employee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Add employee</DialogTitle>
        <DialogDescription>The face photo is processed locally to extract a descriptor.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field id="fn" label="Full name" value={fullName} onChange={setFullName} />
        <Field id="em" label="Email" type="email" value={email} onChange={setEmail} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="dp" label="Department" value={department} onChange={setDepartment} />
          <Field id="ps" label="Position" value={position} onChange={setPosition} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ph">Face photo</Label>
          <Input ref={inputRef} id="ph" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Field({ id, label, type = "text", value, onChange }: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}
