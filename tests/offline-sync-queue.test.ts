import { describe, expect, it } from "vitest";

import { queueTeacherOfflineMutation } from "../lib/cloud-teacher-offline-queue";

const localStudentId = "a0a0a0a0-0000-4000-8000-000000000001";
const board = (elements: unknown[]) => ({
  id: "board-change",
  type: "saveBoard" as const,
  studentId: localStudentId,
  board: { monthKey: "2026-08", label: "أغسطس 2026", elements, canvasHeight: 560, themeKey: "classic", theme: null },
});

describe("طابور مزامنة المعلم دون اتصال", () => {
  it("يبقي آخر نسخة من السبورة في موضعها دون تغيير ترتيب التبعيات", () => {
    const create = { id: "create", type: "upsertStudent" as const, student: { id: localStudentId, clientId: localStudentId, name: "طالب", age: 10, parentPin: "1234" } };
    const queue = queueTeacherOfflineMutation([create, board(["old"])], board(["latest"]));

    expect(queue.map((item) => item.type)).toEqual(["upsertStudent", "saveBoard"]);
    expect((queue[1] as { board: { elements: unknown[] } }).board.elements).toEqual(["latest"]);
  });

  it("يدمج تعديل بيانات طالب محلي مع طلب إنشائه ليحافظ على الرمز السري", () => {
    const create = { id: "create", type: "upsertStudent" as const, student: { id: localStudentId, clientId: localStudentId, name: "طالب", age: 10, parentPin: "1234" } };
    const edit = { id: "edit", type: "upsertStudent" as const, student: { id: localStudentId, clientId: localStudentId, name: "الطالب", age: 11 } };
    const queue = queueTeacherOfflineMutation([create], edit);

    expect(queue).toHaveLength(1);
    expect((queue[0] as { student: Record<string, unknown> }).student).toMatchObject({ name: "الطالب", age: 11, parentPin: "1234" });
  });

  it("يلغي إنشاء الطالب المحلي وسبورته إذا حُذف قبل توفر الإنترنت", () => {
    const create = { id: "create", type: "upsertStudent" as const, student: { id: localStudentId, clientId: localStudentId, name: "طالب", age: 10, parentPin: "1234" } };
    const queue = queueTeacherOfflineMutation([create, board([])], { id: "delete", type: "deleteStudent" as const, studentId: localStudentId });

    expect(queue).toEqual([]);
  });

  it("يضع تذكير الأسبوع بعد حفظ السبورة كي لا يصل قبل نشر التحديث", () => {
    const reminder = { id: "week-reminder", type: "sendWeekReminder" as const, studentId: localStudentId, monthKey: "2026-08", weekNumber: 1 as const, clientReminderId: "b0a0a0a0-0000-4000-8000-000000000001" };
    const queue = queueTeacherOfflineMutation([board([{ id: "week-1", type: "weekRow", weekNumber: 1 }])], reminder);

    expect(queue.map((item) => item.type)).toEqual(["saveBoard", "sendWeekReminder"]);
    expect(queue[1]).toMatchObject({ studentId: localStudentId, weekNumber: 1 });
  });

  it("لا يكرر تأشير رسائل ولي الأمر كمقروءة للطالب نفسه", () => {
    const first = { id: "read-1", type: "markMessagesRead" as const, studentId: localStudentId };
    const duplicate = { id: "read-2", type: "markMessagesRead" as const, studentId: localStudentId };
    const queue = queueTeacherOfflineMutation([first], duplicate);

    expect(queue).toEqual([first]);
  });
});
