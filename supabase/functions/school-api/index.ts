import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = Record<string, unknown> & { action?: string };

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Cache-Control": "no-store, max-age=0",
};

function respond(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function getAdminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  const key = Object.values(secrets)[0];
  if (!key) throw new Error("Supabase secret key is unavailable in the Edge Function runtime.");
  return key;
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is unavailable in the Edge Function runtime.");
  return createClient(url, getAdminKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function bodyOf(request: Request): Promise<RequestBody> {
  try {
    return await request.json() as RequestBody;
  } catch {
    throw new Error("صيغة الطلب غير صحيحة");
  }
}

async function requireTeacher(sessionToken: unknown) {
  const rawToken = String(sessionToken ?? "");
  if (!rawToken) throw new Error("جلسة المعلم مطلوبة");
  const db = admin();
  const { data, error } = await db
    .from("teacher_sessions")
    .select("id, teacher_id, expires_at")
    .eq("token_hash", await hash(rawToken))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) throw new Error("جلسة المعلم غير صالحة أو انتهت");
  await db.from("teacher_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { db, teacherId: data.teacher_id as string };
}

async function requireParent(sessionToken: unknown) {
  const rawToken = String(sessionToken ?? "");
  if (!rawToken) throw new Error("جلسة ولي الأمر مطلوبة");
  const db = admin();
  const { data, error } = await db
    .from("parent_sessions")
    .select("id, student_id, expires_at")
    .eq("token_hash", await hash(rawToken))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) throw new Error("جلسة ولي الأمر غير صالحة أو انتهت");
  await db.from("parent_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return { db, sessionId: data.id as string, studentId: data.student_id as string };
}

async function ensureTeacherStudent(db: ReturnType<typeof admin>, teacherId: string, studentId: unknown) {
  const { data, error } = await db
    .from("students")
    .select("id")
    .eq("id", String(studentId ?? ""))
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error || !data) throw new Error("الطالب غير موجود أو لا تملك صلاحية الوصول إليه");
  return data.id as string;
}

async function teacherSnapshot(db: ReturnType<typeof admin>, teacherId: string) {
  const { data: students, error: studentError } = await db.from("students").select("*").eq("teacher_id", teacherId).order("name");
  if (studentError) throw studentError;
  const ids = (students ?? []).map((student) => student.id);
  const news = await db.from("teacher_news").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }).limit(1);
  if (news.error) throw news.error;
  if (!ids.length) return { students: [], boards: [], attendance: [], messages: [], news: news.data ?? [] };
  const [boards, attendance, messages] = await Promise.all([
    db.from("monthly_boards").select("*").in("student_id", ids).order("month_key", { ascending: false }),
    db.from("attendance").select("*").in("student_id", ids).order("date_key", { ascending: false }),
    db.from("messages").select("*").in("student_id", ids).order("created_at"),
  ]);
  if (boards.error) throw boards.error;
  if (attendance.error) throw attendance.error;
  if (messages.error) throw messages.error;
  return { students: students ?? [], boards: boards.data ?? [], attendance: attendance.data ?? [], messages: messages.data ?? [], news: news.data ?? [] };
}

async function teacherDetail(db: ReturnType<typeof admin>, teacherId: string, rawStudentId: unknown) {
  const studentId = await ensureTeacherStudent(db, teacherId, rawStudentId);
  const [{ data: student, error: studentError }, boards, attendance, messages] = await Promise.all([
    db.from("students").select("*").eq("id", studentId).single(),
    db.from("monthly_boards").select("*").eq("student_id", studentId).order("month_key", { ascending: false }),
    db.from("attendance").select("*").eq("student_id", studentId).order("date_key", { ascending: false }),
    db.from("messages").select("*").eq("student_id", studentId).order("created_at"),
  ]);
  if (studentError) throw studentError;
  if (boards.error) throw boards.error;
  if (attendance.error) throw attendance.error;
  if (messages.error) throw messages.error;
  return { student, boards: boards.data ?? [], attendance: attendance.data ?? [], messages: messages.data ?? [], parentNotification: await parentNotificationStatus(db, studentId) };
}

async function parentNotificationStatus(db: ReturnType<typeof admin>, studentId: string) {
  const [{ data: sessions, error: sessionsError }, { data: latestReminder, error: reminderError }] = await Promise.all([
    db.from("parent_sessions").select("id").eq("student_id", studentId),
    db.from("parent_notifications").select("created_at, delivered_at").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sessionsError) throw sessionsError;
  if (reminderError) throw reminderError;
  const sessionIds = (sessions ?? []).map((session) => session.id);
  if (!sessionIds.length) return { enabled: false, deviceCount: 0, latestReminderAt: latestReminder?.created_at ?? null, sentAt: latestReminder?.delivered_at ?? null };
  const { count, error } = await db.from("device_push_tokens").select("id", { count: "exact", head: true }).in("parent_session_id", sessionIds);
  if (error) throw error;
  return { enabled: (count ?? 0) > 0, deviceCount: count ?? 0, latestReminderAt: latestReminder?.created_at ?? null, sentAt: latestReminder?.delivered_at ?? null };
}

async function notifyParentsAboutWeek(db: ReturnType<typeof admin>, studentId: string, weekNumber: number, clientReminderId: string) {
  const title = "متابعة الحفظ القرآني";
  const body = `تم بدء الأسبوع ${weekNumber} من متابعة حفظ ابنكم في الحلقة.`;
  const { data: existing, error: existingError } = await db.from("parent_notifications").select("id, delivered_at").eq("client_reminder_id", clientReminderId).maybeSingle();
  if (existingError) throw existingError;
  const inserted = existing ? null : await db.from("parent_notifications").insert({ student_id: studentId, client_reminder_id: clientReminderId, title, body }).select("id, delivered_at").single();
  if (inserted?.error) throw inserted.error;
  const notification = existing ?? inserted?.data;
  if (!notification) throw new Error("تعذر حفظ تذكير الأسبوع");
  if (notification.delivered_at) return 0;
  const { data: sessions, error: sessionsError } = await db.from("parent_sessions").select("id").eq("student_id", studentId);
  if (sessionsError) throw sessionsError;
  const sessionIds = (sessions ?? []).map((session) => session.id);
  if (!sessionIds.length) {
    await db.from("parent_notifications").update({ delivered_at: new Date().toISOString() }).eq("id", notification.id);
    return 0;
  }
  const { data: devices, error: devicesError } = await db.from("device_push_tokens").select("token").in("parent_session_id", sessionIds);
  if (devicesError) throw devicesError;
  const tokens = [...new Set((devices ?? []).map((device) => String(device.token)).filter((value) => value.startsWith("ExponentPushToken[") || value.startsWith("ExpoPushToken[")))];
  if (tokens.length) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(tokens.map((to) => ({ to, sound: "default", title, body, channelId: "teacher-notes", data: { studentId, weekNumber } }))) });
    if (!response.ok) throw new Error("تعذر إرسال تذكير ولي الأمر");
  }
  await db.from("parent_notifications").update({ delivered_at: new Date().toISOString() }).eq("id", notification.id);
  return tokens.length;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });
  if (request.method !== "POST") return respond(405, { error: "استخدم طلب POST" });

  try {
    const body = await bodyOf(request);
    const action = String(body.action ?? "");

    if (action === "teacher.status") {
      const { count, error } = await admin().from("teacher_access").select("id", { count: "exact", head: true });
      if (error) throw error;
      return respond(200, { configured: (count ?? 0) > 0, googleLinked: false });
    }

    if (action === "teacher.setup") {
      const setupKey = String(body.setupKey ?? "");
      const configuredKey = Deno.env.get("SCHOOL_SETUP_KEY");
      const localPin = String(body.localPin ?? "");
      if (!configuredKey || setupKey !== configuredKey) return respond(403, { error: "رمز إعداد المدرسة غير صحيح" });
      if (localPin.length < 4) return respond(400, { error: "رمز المعلم يجب أن يتكون من 4 خانات على الأقل" });
      const db = admin();
      const { count, error: countError } = await db.from("teacher_access").select("id", { count: "exact", head: true });
      if (countError) throw countError;
      if ((count ?? 0) > 0) return respond(409, { error: "تم إعداد حساب المعلم مسبقاً" });
      const { data, error } = await db
        .from("teacher_access")
        .insert({ display_name: String(body.displayName ?? "المعلم").trim() || "المعلم", local_pin_hash: await hash(localPin) })
        .select("id, display_name")
        .single();
      if (error) throw error;
      return respond(201, { teacher: data });
    }

    if (action === "teacher.login") {
      const localPin = String(body.localPin ?? "");
      const db = admin();
      const { data: teacher, error } = await db.from("teacher_access").select("id, display_name, local_pin_hash").limit(1).maybeSingle();
      if (error || !teacher || teacher.local_pin_hash !== await hash(localPin)) return respond(401, { error: "رمز المعلم غير صحيح" });
      const rawToken = token();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString();
      const { error: sessionError } = await db.from("teacher_sessions").insert({ teacher_id: teacher.id, token_hash: await hash(rawToken), expires_at: expiresAt });
      if (sessionError) throw sessionError;
      return respond(200, { sessionToken: rawToken, expiresAt, teacher: { id: teacher.id, displayName: teacher.display_name } });
    }

    if (action === "teacher.logout") {
      const rawToken = String(body.sessionToken ?? "");
      if (rawToken) await admin().from("teacher_sessions").delete().eq("token_hash", await hash(rawToken));
      return respond(200, { ok: true });
    }

    if (action === "teacher.snapshot") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      return respond(200, await teacherSnapshot(db, teacherId));
    }

    if (action === "teacher.detail") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      return respond(200, await teacherDetail(db, teacherId, body.studentId));
    }

    if (action === "teacher.upsertStudent") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const student = (body.student ?? {}) as Record<string, unknown>;
      const name = String(student.name ?? "").trim();
      const age = Number(student.age);
      const parentPin = String(student.parentPin ?? "");
      if (!name || !Number.isInteger(age) || age < 1 || age > 120) return respond(400, { error: "بيانات الطالب غير مكتملة" });
      const requestedId = String(student.id ?? "");
      if (requestedId) {
        const { data: existing, error: existingError } = await db.from("students").select("id").eq("id", requestedId).eq("teacher_id", teacherId).maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          const id = existing.id;
          const patch: Record<string, unknown> = { name, normalized_name: normalizeName(name), age };
          if (parentPin) patch.parent_pin_hash = await hash(parentPin);
          const { data, error } = await db.from("students").update(patch).eq("id", id).select("*").single();
          if (error) throw error;
          return respond(200, { student: data });
        }
        if (student.clientId !== requestedId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)) return respond(404, { error: "الطالب غير موجود" });
        if (parentPin.length < 4) return respond(400, { error: "رمز ولي الأمر يجب أن يتكون من 4 خانات على الأقل" });
        const { data, error } = await db
          .from("students")
          .insert({ id: requestedId, teacher_id: teacherId, name, normalized_name: normalizeName(name), age, parent_pin_hash: await hash(parentPin) })
          .select("*")
          .single();
        if (error) throw error;
        return respond(201, { student: data });
      }
      if (parentPin.length < 4) return respond(400, { error: "رمز ولي الأمر يجب أن يتكون من 4 خانات على الأقل" });
      const { data, error } = await db
        .from("students")
        .insert({ teacher_id: teacherId, name, normalized_name: normalizeName(name), age, parent_pin_hash: await hash(parentPin) })
        .select("*")
        .single();
      if (error) throw error;
      return respond(201, { student: data });
    }

    if (action === "teacher.deleteStudent") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const id = await ensureTeacherStudent(db, teacherId, body.studentId);
      const { error } = await db.from("students").delete().eq("id", id);
      if (error) throw error;
      return respond(200, { ok: true });
    }

    if (action === "teacher.saveBoard") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const board = (body.board ?? {}) as Record<string, unknown>;
      const monthKey = String(board.monthKey ?? "");
      if (!/^\d{4}-\d{2}$/.test(monthKey)) return respond(400, { error: "مفتاح الشهر غير صحيح" });
      const record = {
        student_id: studentId,
        month_key: monthKey,
        label: String(board.label ?? monthKey).slice(0, 40),
        elements: Array.isArray(board.elements) ? board.elements : [],
        canvas_height: Math.max(560, Math.min(5000, Number(board.canvasHeight) || 560)),
        theme_key: String(board.themeKey ?? "classic").slice(0, 32),
        theme: board.theme ?? null,
      };
      const { data, error } = await db.from("monthly_boards").upsert(record, { onConflict: "student_id,month_key" }).select("*").single();
      if (error) throw error;
      return respond(200, { board: data });
    }

    if (action === "teacher.toggleAttendance") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const dateKey = String(body.dateKey ?? "");
      const period = body.period === "evening" ? "evening_absent" : "morning_absent";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return respond(400, { error: "تاريخ الغياب غير صحيح" });
      const { data: current, error: currentError } = await db.from("attendance").select("*").eq("student_id", studentId).eq("date_key", dateKey).maybeSingle();
      if (currentError) throw currentError;
      const next = { student_id: studentId, date_key: dateKey, morning_absent: current?.morning_absent ?? false, evening_absent: current?.evening_absent ?? false, [period]: !(current?.[period] ?? false) };
      const { data, error } = await db.from("attendance").upsert(next, { onConflict: "student_id,date_key" }).select("*").single();
      if (error) throw error;
      return respond(200, { attendance: data });
    }

    if (action === "teacher.setAttendance") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const dateKey = String(body.dateKey ?? "");
      const period = body.period === "evening" ? "evening_absent" : "morning_absent";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return respond(400, { error: "تاريخ الغياب غير صحيح" });
      const { data: current, error: currentError } = await db.from("attendance").select("*").eq("student_id", studentId).eq("date_key", dateKey).maybeSingle();
      if (currentError) throw currentError;
      const next = { student_id: studentId, date_key: dateKey, morning_absent: current?.morning_absent ?? false, evening_absent: current?.evening_absent ?? false, [period]: Boolean(body.absent) };
      const { data, error } = await db.from("attendance").upsert(next, { onConflict: "student_id,date_key" }).select("*").single();
      if (error) throw error;
      return respond(200, { attendance: data });
    }

    if (action === "teacher.createMessage") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const content = String(body.content ?? "").trim();
      if (!content) return respond(400, { error: "نص الرسالة مطلوب" });
      const clientId = body.clientMessageId ? String(body.clientMessageId) : null;
      if (clientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) return respond(400, { error: "معرّف الرسالة غير صحيح" });
      if (clientId) {
        const { data: existing, error: existingError } = await db.from("messages").select("*").eq("client_id", clientId).maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          if (existing.student_id !== studentId || existing.sender_role !== "teacher") return respond(409, { error: "معرّف الرسالة مستخدم لرسالة أخرى" });
          return respond(200, { message: existing });
        }
      }
      const { data, error } = await db.from("messages").insert({ student_id: studentId, sender_role: "teacher", content, is_note: Boolean(body.isNote), client_id: clientId }).select("*").single();
      if (error) throw error;
      return respond(201, { message: data });
    }

    if (action === "teacher.markMessagesRead") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const { data, error } = await db.from("messages").update({ read_at: new Date().toISOString() }).eq("student_id", studentId).eq("sender_role", "parent").is("read_at", null).select("id");
      if (error) throw error;
      return respond(200, { updated: data?.length ?? 0 });
    }

    if (action === "teacher.createNews") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const content = String(body.content ?? "").trim();
      if (!content || content.length > 800) return respond(400, { error: "اكتب خبراً بين حرف واحد و800 حرف." });
      const { data, error } = await db.from("teacher_news").upsert({ teacher_id: teacherId, content }, { onConflict: "teacher_id" }).select("*").single();
      if (error) throw error;
      return respond(201, { news: data });
    }

    if (action === "teacher.updateNews") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const content = String(body.content ?? "").trim();
      const newsId = String(body.newsId ?? "");
      if (!content || content.length > 800) return respond(400, { error: "اكتب خبراً بين حرف واحد و800 حرف." });
      const { data, error } = await db.from("teacher_news").update({ content }).eq("id", newsId).eq("teacher_id", teacherId).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return respond(404, { error: "الخبر غير موجود أو لا تملك صلاحية تعديله." });
      return respond(200, { news: data });
    }

    if (action === "teacher.deleteNews") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const { error } = await db.from("teacher_news").delete().eq("id", String(body.newsId ?? "")).eq("teacher_id", teacherId);
      if (error) throw error;
      return respond(200, { ok: true });
    }

    if (action === "teacher.sendWeekReminder") {
      const { db, teacherId } = await requireTeacher(body.sessionToken);
      const studentId = await ensureTeacherStudent(db, teacherId, body.studentId);
      const weekNumber = Number(body.weekNumber);
      const clientReminderId = String(body.clientReminderId ?? "");
      if (![1, 2, 3, 4].includes(weekNumber)) return respond(400, { error: "رقم الأسبوع غير صحيح" });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientReminderId)) return respond(400, { error: "معرّف تذكير الأسبوع غير صحيح" });
      return respond(200, { delivered: await notifyParentsAboutWeek(db, studentId, weekNumber, clientReminderId) });
    }

    if (action === "parent.login") {
      const db = admin();
      const normalizedName = normalizeName(body.name);
      const pinHash = await hash(String(body.parentPin ?? ""));
      const { data: student, error } = await db.from("students").select("id, name, parent_pin_hash").eq("normalized_name", normalizedName).eq("parent_pin_hash", pinHash).maybeSingle();
      if (error || !student) return respond(401, { error: "اسم الطالب أو الرمز غير صحيح" });
      const rawToken = token();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
      const { data: session, error: sessionError } = await db.from("parent_sessions").insert({ student_id: student.id, token_hash: await hash(rawToken), expires_at: expiresAt }).select("id").single();
      if (sessionError) throw sessionError;
      const pushToken = String(body.pushToken ?? "");
      if (pushToken) await db.from("device_push_tokens").upsert({ parent_session_id: session.id, token: pushToken, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
      return respond(200, { sessionToken: rawToken, expiresAt, student: { id: student.id, name: student.name } });
    }

    if (action === "parent.snapshot") {
      const { db, studentId } = await requireParent(body.sessionToken);
      const [student, boards, attendance, messages] = await Promise.all([
        db.from("students").select("id, name, age, teacher_id").eq("id", studentId).single(),
        db.from("monthly_boards").select("*").eq("student_id", studentId).order("month_key", { ascending: false }),
        db.from("attendance").select("*").eq("student_id", studentId).order("date_key", { ascending: false }),
        db.from("messages").select("*").eq("student_id", studentId).order("created_at"),
      ]);
      if (student.error || boards.error || attendance.error || messages.error) throw student.error ?? boards.error ?? attendance.error ?? messages.error;
      const news = await db.from("teacher_news").select("*").eq("teacher_id", student.data.teacher_id).order("created_at", { ascending: false }).limit(1);
      if (news.error) throw news.error;
      return respond(200, { student: { id: student.data.id, name: student.data.name, age: student.data.age }, boards: boards.data ?? [], attendance: attendance.data ?? [], messages: messages.data ?? [], news: news.data ?? [] });
    }

    if (action === "parent.registerPushToken") {
      const { db, sessionId } = await requireParent(body.sessionToken);
      const pushToken = String(body.pushToken ?? "");
      if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) return respond(400, { error: "رمز جهاز الإشعارات غير صحيح" });
      const { error } = await db.from("device_push_tokens").upsert({ parent_session_id: sessionId, token: pushToken, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
      if (error) throw error;
      return respond(200, { ok: true });
    }

    if (action === "parent.createMessage") {
      const { db, studentId } = await requireParent(body.sessionToken);
      const content = String(body.content ?? "").trim();
      if (!content) return respond(400, { error: "نص الرسالة مطلوب" });
      const { data, error } = await db.from("messages").insert({ student_id: studentId, sender_role: "parent", content, is_note: false }).select("*").single();
      if (error) throw error;
      return respond(201, { message: data });
    }

    return respond(404, { error: "الإجراء غير معروف" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تنفيذ العملية";
    return respond(400, { error: message });
  }
});
