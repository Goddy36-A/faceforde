export function todayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function classifyStatus(checkInISO: string): "present" | "late" | "absent" {
  const d = new Date(checkInISO);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes <= 9 * 60) return "present"; // before 9:00
  if (minutes <= 10 * 60) return "late";   // 9:01–10:00
  return "late"; // anything after 10 still counted late on check-in (absent only when no checkin)
}

export function hoursBetween(startISO: string, endISO: string): number {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  return Math.max(0, Math.round((ms / 3600000) * 100) / 100);
}
