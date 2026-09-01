import { describe, expect, it } from "vitest";

import { arrangeSessionStudents, attendanceTone, matchesStudentName } from "../lib/student-session-list";

const students = [
  { id: "ahmad", teacher_id: "teacher", name: "أحمد محمد", normalized_name: "أحمد محمد", age: 10, created_at: "2026-08-27", updated_at: "2026-08-27" },
  { id: "zayd", teacher_id: "teacher", name: "زيد علي", normalized_name: "زيد علي", age: 11, created_at: "2026-08-27", updated_at: "2026-08-27" },
  { id: "maryam", teacher_id: "teacher", name: "مريم حسن", normalized_name: "مريم حسن", age: 9, created_at: "2026-08-27", updated_at: "2026-08-27" },
];

const attendance = new Map([
  ["ahmad", { id: "a", student_id: "ahmad", date_key: "2026-08-27", morning_absent: true, evening_absent: true }],
  ["zayd", { id: "z", student_id: "zayd", date_key: "2026-08-27", morning_absent: true, evening_absent: false }],
]);

describe("بحث وترتيب قائمة الطلاب", () => {
  it("يبحث بالاسم الأول أو العائلة مع تطبيع الحروف العربية الشائعة", () => {
    expect(matchesStudentName(students[0], "احمد")).toBe(true);
    expect(matchesStudentName(students[0], "محمد")).toBe(true);
    expect(matchesStudentName(students[0], "علي")).toBe(false);
  });

  it("يرفع المستعدين حتى إن كانوا غائبين ويؤخر الغائبين في بقية القائمة", () => {
    const result = arrangeSessionStudents(students, new Set(["ahmad"]), attendance, "", false);

    expect(result.ready.map((student) => student.id)).toEqual(["ahmad"]);
    expect(result.others.map((student) => student.id)).toEqual(["maryam", "zayd"]);
  });

  it("يعرض فلتر المستعدين القسم الخاص بهم فقط", () => {
    const result = arrangeSessionStudents(students, new Set(["maryam"]), attendance, "", true);

    expect(result.ready.map((student) => student.id)).toEqual(["maryam"]);
    expect(result.others).toEqual([]);
  });

  it("يميّز الغياب الواحد عن الغياب الكامل", () => {
    expect(attendanceTone(attendance.get("zayd"))).toBe("partialAbsent");
    expect(attendanceTone(attendance.get("ahmad"))).toBe("fullAbsent");
    expect(attendanceTone(undefined)).toBe("present");
  });
});
