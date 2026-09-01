import type { AttendanceRecord } from "./app-types";

export function attendanceDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("ar-EG-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

export function attendanceForMonth(records: AttendanceRecord[], monthKey: string) {
  return records.filter((record) => record.dateKey.startsWith(monthKey));
}
