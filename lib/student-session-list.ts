import type { SchoolAttendance, SchoolStudent } from "@/lib/supabase-school-api";

export type AttendanceTone = "present" | "partialAbsent" | "fullAbsent";

function normalizedArabic(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar");
}

export function matchesStudentName(student: Pick<SchoolStudent, "name" | "normalized_name">, query: string): boolean {
  const needle = normalizedArabic(query);
  if (!needle) return true;
  return normalizedArabic(student.name).includes(needle) || normalizedArabic(student.normalized_name).includes(needle);
}

export function attendanceTone(record: Pick<SchoolAttendance, "morning_absent" | "evening_absent"> | undefined): AttendanceTone {
  if (record?.morning_absent && record.evening_absent) return "fullAbsent";
  if (record?.morning_absent || record?.evening_absent) return "partialAbsent";
  return "present";
}

export function arrangeSessionStudents(students: SchoolStudent[], readyStudentIds: Set<string>, attendanceByStudent: Map<string, SchoolAttendance>, query: string, readyOnly: boolean): { ready: SchoolStudent[]; others: SchoolStudent[] } {
  const collator = new Intl.Collator("ar", { sensitivity: "base" });
  const matching = students.filter((student) => matchesStudentName(student, query));
  const ready = matching.filter((student) => readyStudentIds.has(student.id)).sort((a, b) => collator.compare(a.name, b.name));
  if (readyOnly) return { ready, others: [] };
  const rank: Record<AttendanceTone, number> = { present: 0, partialAbsent: 1, fullAbsent: 2 };
  const others = matching
    .filter((student) => !readyStudentIds.has(student.id))
    .sort((a, b) => rank[attendanceTone(attendanceByStudent.get(a.id))] - rank[attendanceTone(attendanceByStudent.get(b.id))] || collator.compare(a.name, b.name));
  return { ready, others };
}
