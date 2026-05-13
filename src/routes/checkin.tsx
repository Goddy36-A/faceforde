import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ScanFace, AlertCircle, CheckCircle2 } from "lucide-react";
import { loadFaceApi, getDescriptorFromVideo, euclideanDistance } from "@/lib/face-api";
import { todayDateString, classifyStatus, hoursBetween } from "@/lib/attendance";

export const Route = createFileRoute("/checkin")({
  component: () => (
    <AppLayout>
      <CheckinPage />
    </AppLayout>
  ),
});

interface EnrolledEmployee {
  id: string;
  full_name: string;
  department: string;
  photo_url: string | null;
  face_descriptor: number[];
}

interface ConfirmCard {
  name: string;
  department: string;
  photo_url: string | null;
  time: string;
  status: string;
  action: "checked-in" | "checked-out";
}

const MATCH_THRESHOLD = 0.5;

function CheckinPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [employees, setEmployees] = useState<EnrolledEmployee[]>([]);
  const [confirm, setConfirm] = useState<ConfirmCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const init = async () => {
      try {
        await loadFaceApi();
        setLoadingModels(false);
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
        const { data } = await supabase
          .from("employees")
          .select("id, full_name, department, photo_url, face_descriptor")
          .not("face_descriptor", "is", null);
        setEmployees((data ?? []) as any);
      } catch (e: any) {
        setError(e.message ?? "Camera permission denied");
        setLoadingModels(false);
      }
    };
    init();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleScan = async () => {
    if (!videoRef.current || !ready) return;
    setScanning(true);
    setError(null);
    setConfirm(null);
    try {
      const desc = await getDescriptorFromVideo(videoRef.current);
      if (!desc) {
        setError("No face detected. Look straight at the camera.");
        setScanning(false);
        return;
      }
      let best: { emp: EnrolledEmployee; dist: number } | null = null;
      for (const e of employees) {
        if (!e.face_descriptor) continue;
        const d = euclideanDistance(Array.from(desc), e.face_descriptor);
        if (!best || d < best.dist) best = { emp: e, dist: d };
      }
      if (!best || best.dist > MATCH_THRESHOLD) {
        setError("Unknown face. Please contact admin to enroll.");
        setScanning(false);
        return;
      }
      const emp = best.emp;
      const today = todayDateString();
      const nowISO = new Date().toISOString();

      // Find existing log for today
      const { data: existing } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("date", today)
        .maybeSingle();

      if (!existing) {
        const status = classifyStatus(nowISO);
        const { error: insErr } = await supabase.from("attendance_logs").insert({
          employee_id: emp.id,
          check_in_time: nowISO,
          date: today,
          status,
        });
        if (insErr) throw insErr;
        setConfirm({
          name: emp.full_name,
          department: emp.department,
          photo_url: emp.photo_url,
          time: new Date(nowISO).toLocaleTimeString(),
          status,
          action: "checked-in",
        });
      } else if (!existing.check_out_time) {
        const hours = existing.check_in_time ? hoursBetween(existing.check_in_time, nowISO) : 0;
        const { error: updErr } = await supabase
          .from("attendance_logs")
          .update({ check_out_time: nowISO, hours_worked: hours })
          .eq("id", existing.id);
        if (updErr) throw updErr;
        setConfirm({
          name: emp.full_name,
          department: emp.department,
          photo_url: emp.photo_url,
          time: new Date(nowISO).toLocaleTimeString(),
          status: existing.status,
          action: "checked-out",
        });
      } else {
        setError(`${emp.full_name} has already checked in and out today.`);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to process");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Face Check-in</h1>
        <p className="text-sm text-muted-foreground">Look at the camera and tap scan to record your attendance.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScanFace className="h-5 w-5 text-primary" /> Live camera</CardTitle>
            <CardDescription>{loadingModels ? "Loading face models…" : ready ? `${employees.length} enrolled employees` : "Initializing camera"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-video rounded-md overflow-hidden bg-black ring-1 ring-border relative">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {(!ready || loadingModels) && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
            <Button onClick={handleScan} disabled={!ready || scanning} className="w-full">
              {scanning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Scan & Check {confirm?.action === "checked-in" ? "Out" : "In"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {confirm && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={confirm.photo_url ?? undefined} />
                    <AvatarFallback>{confirm.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-base font-semibold">{confirm.name}</p>
                    <p className="text-xs text-muted-foreground">{confirm.department}</p>
                  </div>
                </div>
                <div className="rounded-md bg-success/10 border border-success/30 p-3 flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Successfully {confirm.action} at {confirm.time} ({confirm.status})</span>
                </div>
              </div>
            )}
            {!error && !confirm && (
              <p className="text-sm text-muted-foreground">No scan yet. Hit the button to begin.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
