import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabasePublishableKey?: string };
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? extra.supabasePublishableKey;

export type SchoolApiError = Error & { status?: number };

export type SchoolStudent = {
  id: string;
  teacher_id: string;
  name: string;
  normalized_name: string;
  age: number;
  created_at: string;
  updated_at: string;
};

export type SchoolBoard = {
  id: string;
  student_id: string;
  month_key: string;
  label: string;
  elements: unknown[];
  canvas_height: number;
  theme_key: string;
  theme: Record<string, string> | null;
  updated_at?: string;
};

export type SchoolAttendance = {
  id: string;
  student_id: string;
  date_key: string;
  morning_absent: boolean;
  evening_absent: boolean;
};

export type SchoolMessage = {
  id: string;
  student_id: string;
  sender_role: "teacher" | "parent";
  content: string;
  is_note: boolean;
  created_at: string;
  read_at: string | null;
};

export type SchoolNews = { id: string; teacher_id: string; content: string; created_at: string; updated_at?: string };

export type ParentNotificationStatus = {
  enabled: boolean;
  deviceCount: number;
  latestReminderAt: string | null;
  sentAt: string | null;
};

function getConfig() {
  return { projectUrl, publishableKey };
}

export async function schoolApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const config = getConfig();
  const isWeb = typeof window !== "undefined";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response | null = null;
  let lastError: Error | null = null;

  // On web, prefer same-origin server proxy to avoid CORS and browser restrictions
  if (isWeb) {
    try {
      response = await fetch("/api/school-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Fallback to direct Supabase edge function if not web or if server proxy failed
  if (!response && config.projectUrl && config.publishableKey) {
    try {
      response = await fetch(`${config.projectUrl}/functions/v1/school-api`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.publishableKey}`,
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        clearTimeout(timeoutId);
        throw new Error("انتهت مهلة الاتصال بالسحابة. تحقق من الإنترنت وحاول مجدداً.");
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  clearTimeout(timeoutId);

  if (!response) {
    if (lastError && lastError.message.includes("Failed to fetch")) {
      throw new Error("تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت ثم أعد المحاولة.");
    }
    throw lastError ?? new Error("تعذر الاتصال بخدمة المدرسة السحابية.");
  }

  const payloadJson = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    const error = new Error(payloadJson.error ?? "تعذر الاتصال بخدمة المدرسة السحابية.") as SchoolApiError;
    error.status = response.status;
    throw error;
  }
  return payloadJson;
}

export const supabaseSchool = {
  teacherStatus: () => schoolApi<{ configured: boolean; googleLinked: boolean }>("teacher.status"),
  teacherLogin: (localPin: string) => schoolApi<{ sessionToken: string; expiresAt: string; teacher: { id: string; displayName: string } }>("teacher.login", { localPin: localPin.trim() }),
  teacherSnapshot: (sessionToken: string) => schoolApi<{ students: SchoolStudent[]; boards: SchoolBoard[]; attendance: SchoolAttendance[]; messages: SchoolMessage[]; news: SchoolNews[] }>("teacher.snapshot", { sessionToken }),
  teacherDetail: (sessionToken: string, studentId: string) => schoolApi<{ student: SchoolStudent; boards: SchoolBoard[]; attendance: SchoolAttendance[]; messages: SchoolMessage[]; parentNotification: ParentNotificationStatus }>("teacher.detail", { sessionToken, studentId }),
  upsertStudent: (sessionToken: string, student: Record<string, unknown>) => schoolApi<{ student: SchoolStudent }>("teacher.upsertStudent", { sessionToken, student }),
  deleteStudent: (sessionToken: string, studentId: string) => schoolApi<{ ok: true }>("teacher.deleteStudent", { sessionToken, studentId }),
  toggleAttendance: (sessionToken: string, studentId: string, period: "morning" | "evening", dateKey?: string) => schoolApi<{ attendance: SchoolAttendance }>("teacher.toggleAttendance", { sessionToken, studentId, period, ...(dateKey ? { dateKey } : {}) }),
  setAttendance: (sessionToken: string, studentId: string, period: "morning" | "evening", dateKey: string, absent: boolean) => schoolApi<{ attendance: SchoolAttendance }>("teacher.setAttendance", { sessionToken, studentId, period, dateKey, absent }),
  saveBoard: (sessionToken: string, studentId: string, board: Record<string, unknown>) => schoolApi<{ board: SchoolBoard }>("teacher.saveBoard", { sessionToken, studentId, board }),
  sendTeacherMessage: (sessionToken: string, studentId: string, content: string, isNote = false, clientMessageId?: string) => schoolApi<{ message: SchoolMessage }>("teacher.createMessage", { sessionToken, studentId, content, isNote, ...(clientMessageId ? { clientMessageId } : {}) }),
  markTeacherMessagesRead: (sessionToken: string, studentId: string) => schoolApi<{ updated: number }>("teacher.markMessagesRead", { sessionToken, studentId }),
  createTeacherNews: (sessionToken: string, content: string) => schoolApi<{ news: SchoolNews }>("teacher.createNews", { sessionToken, content }),
  updateTeacherNews: (sessionToken: string, newsId: string, content: string) => schoolApi<{ news: SchoolNews }>("teacher.updateNews", { sessionToken, newsId, content }),
  deleteTeacherNews: (sessionToken: string, newsId: string) => schoolApi<{ ok: true }>("teacher.deleteNews", { sessionToken, newsId }),
  sendWeekReminder: (sessionToken: string, studentId: string, monthKey: string, weekNumber: 1 | 2 | 3 | 4, clientReminderId: string) => schoolApi<{ delivered: number }>("teacher.sendWeekReminder", { sessionToken, studentId, monthKey, weekNumber, clientReminderId }),
  parentLogin: (name: string, parentPin: string, pushToken?: string) => schoolApi<{ sessionToken: string; expiresAt: string; student: { id: string; name: string } }>("parent.login", { name: name.trim(), parentPin: parentPin.trim(), ...(pushToken ? { pushToken } : {}) }),
  registerParentPushToken: (sessionToken: string, pushToken: string) => schoolApi<{ ok: true }>("parent.registerPushToken", { sessionToken, pushToken }),
  parentSnapshot: (sessionToken: string) => schoolApi<{ student: Pick<SchoolStudent, "id" | "name" | "age">; boards: SchoolBoard[]; attendance: SchoolAttendance[]; messages: SchoolMessage[]; news: SchoolNews[] }>("parent.snapshot", { sessionToken }),
  sendParentMessage: (sessionToken: string, content: string) => schoolApi<{ message: SchoolMessage }>("parent.createMessage", { sessionToken, content }),
};
