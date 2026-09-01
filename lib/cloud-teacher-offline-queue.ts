export type QueuedBoard = {
  monthKey: string;
  label: string;
  elements: unknown[];
  canvasHeight: number;
  themeKey: string;
  theme: Record<string, string> | null;
};

export type TeacherOfflineMutation =
  | { id: string; type: "upsertStudent"; student: Record<string, unknown> }
  | { id: string; type: "deleteStudent"; studentId: string }
  | { id: string; type: "saveBoard"; studentId: string; board: QueuedBoard }
  | { id: string; type: "setAttendance"; studentId: string; period: "morning" | "evening"; dateKey: string; absent: boolean }
  | { id: string; type: "sendMessage"; studentId: string; content: string; isNote: boolean; clientMessageId: string }
  | { id: string; type: "sendWeekReminder"; studentId: string; monthKey: string; weekNumber: 1 | 2 | 3 | 4; clientReminderId: string }
  | { id: string; type: "markMessagesRead"; studentId: string };

export type TeacherOfflineMutationInput =
  | Omit<Extract<TeacherOfflineMutation, { type: "upsertStudent" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "deleteStudent" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "saveBoard" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "setAttendance" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "sendMessage" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "sendWeekReminder" }>, "id">
  | Omit<Extract<TeacherOfflineMutation, { type: "markMessagesRead" }>, "id">;

function studentIdFromMutation(mutation: Extract<TeacherOfflineMutation, { type: "upsertStudent" }>): string {
  return String(mutation.student.id ?? mutation.student.clientId ?? "");
}

export function queueTeacherOfflineMutation(queue: TeacherOfflineMutation[], mutation: TeacherOfflineMutation): TeacherOfflineMutation[] {
  if (mutation.type === "saveBoard") {
    const index = queue.findIndex((item) => item.type === "saveBoard" && item.studentId === mutation.studentId && item.board.monthKey === mutation.board.monthKey);
    if (index < 0) return [...queue, mutation];
    return queue.map((item, itemIndex) => itemIndex === index ? mutation : item);
  }
  if (mutation.type === "setAttendance") {
    const index = queue.findIndex((item) => item.type === "setAttendance" && item.studentId === mutation.studentId && item.dateKey === mutation.dateKey && item.period === mutation.period);
    if (index < 0) return [...queue, mutation];
    return queue.map((item, itemIndex) => itemIndex === index ? mutation : item);
  }
  if (mutation.type === "markMessagesRead") {
    return queue.some((item) => item.type === "markMessagesRead" && item.studentId === mutation.studentId) ? queue : [...queue, mutation];
  }
  if (mutation.type === "upsertStudent") {
    const id = studentIdFromMutation(mutation);
    const index = queue.findIndex((item) => item.type === "upsertStudent" && studentIdFromMutation(item) === id);
    if (index < 0) return [...queue, mutation];
    const existing = queue[index] as Extract<TeacherOfflineMutation, { type: "upsertStudent" }>;
    const merged = { ...existing.student, ...mutation.student };
    return queue.map((item, itemIndex) => itemIndex === index ? { ...mutation, student: merged } : item);
  }
  if (mutation.type === "deleteStudent") {
    const pendingCreate = queue.some((item) => item.type === "upsertStudent" && studentIdFromMutation(item) === mutation.studentId && item.student.clientId === mutation.studentId);
    if (pendingCreate) return queue.filter((item) => !("studentId" in item ? item.studentId === mutation.studentId : studentIdFromMutation(item as Extract<TeacherOfflineMutation, { type: "upsertStudent" }>) === mutation.studentId));
    return [...queue.filter((item) => ("studentId" in item ? item.studentId !== mutation.studentId : studentIdFromMutation(item as Extract<TeacherOfflineMutation, { type: "upsertStudent" }>) !== mutation.studentId)), mutation];
  }
  return [...queue, mutation];
}
