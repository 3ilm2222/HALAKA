import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attendance,
  dailyCloudBackups,
  InsertStudent,
  InsertUser,
  messages,
  monthlyBoards,
  parentSessions,
  students,
  teacherAccess,
  teacherSessions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type BoardElement = Record<string, unknown>;
export type AttendanceRecord = { dateKey: string; morningAbsent: boolean; eveningAbsent: boolean };

export type ParsedBoard = {
  id: number;
  studentId: number;
  monthKey: string;
  label: string;
  canvasHeight: number;
  themeKey: string;
  themeColors: { canvas: string; accent: string; ink: string; gold: string } | null;
  elements: BoardElement[];
  createdAt: Date;
  updatedAt: Date;
};

function parseElements(elementsJson: string): BoardElement[] {
  try {
    const parsed = JSON.parse(elementsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseThemeColors(themeJson: string | null) {
  if (!themeJson) return null;
  try {
    const parsed = JSON.parse(themeJson) as Record<string, unknown>;
    const color = (key: string) => typeof parsed[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(parsed[key] as string) ? parsed[key] as string : null;
    const canvas = color("canvas");
    const accent = color("accent");
    const ink = color("ink");
    const gold = color("gold");
    return canvas && accent && ink && gold ? { canvas, accent, ink, gold } : null;
  } catch {
    return null;
  }
}

function toParsedBoard(board: typeof monthlyBoards.$inferSelect): ParsedBoard {
  return {
    ...board,
    elements: parseElements(board.elementsJson),
    themeColors: parseThemeColors(board.themeJson),
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
  return db;
}

const LOCAL_TEACHER_OPEN_ID = "local-teacher-account";

export async function getLocalTeacherAccess() {
  const db = await requireDb();
  const [access] = await db.select().from(teacherAccess).where(eq(teacherAccess.id, 1)).limit(1);
  return access;
}

export async function initializeLocalTeacher(pinHash: string) {
  const db = await requireDb();
  const existing = await getLocalTeacherAccess();
  if (existing) throw new Error("تم إعداد رمز دخول المعلم مسبقاً");

  let [teacher] = await db.select().from(users).where(eq(users.openId, LOCAL_TEACHER_OPEN_ID)).limit(1);
  if (!teacher) {
    await db.insert(users).values({ openId: LOCAL_TEACHER_OPEN_ID, name: "المعلم", loginMethod: "local", role: "admin" });
    [teacher] = await db.select().from(users).where(eq(users.openId, LOCAL_TEACHER_OPEN_ID)).limit(1);
  }
  if (!teacher) throw new Error("تعذر إعداد حساب المعلم المحلي");
  await db.insert(teacherAccess).values({ id: 1, teacherId: teacher.id, pinHash });
  return teacher;
}

export async function verifyLocalTeacherPin(pinHash: string) {
  const db = await requireDb();
  const [access] = await db.select().from(teacherAccess).where(and(eq(teacherAccess.id, 1), eq(teacherAccess.pinHash, pinHash))).limit(1);
  return access;
}

export async function resetLocalTeacherPin(pinHash: string) {
  const db = await requireDb();
  const access = await getLocalTeacherAccess();
  if (!access) throw new Error("لم يتم إعداد رمز المعلم بعد");
  await db.update(teacherAccess).set({ pinHash }).where(eq(teacherAccess.id, 1));
  await db.delete(teacherSessions).where(eq(teacherSessions.teacherId, access.teacherId));
  return access.teacherId;
}

export async function linkGoogleToLocalTeacher(teacherId: number, googleOpenId: string) {
  const db = await requireDb();
  await db.update(teacherAccess).set({ googleOpenId }).where(and(eq(teacherAccess.id, 1), eq(teacherAccess.teacherId, teacherId)));
}

export async function getLocalTeacherIdByGoogle(googleOpenId: string) {
  const db = await requireDb();
  const [access] = await db.select().from(teacherAccess).where(eq(teacherAccess.googleOpenId, googleOpenId)).limit(1);
  return access?.teacherId;
}

export async function getDailyCloudBackup(teacherId: number) {
  const db = await requireDb();
  const [backup] = await db.select().from(dailyCloudBackups).where(eq(dailyCloudBackups.teacherId, teacherId)).orderBy(desc(dailyCloudBackups.backupDate)).limit(1);
  return backup;
}

export async function saveDailyCloudBackup(teacherId: number, backupDate: string, storageKey: string, storageUrl: string) {
  const db = await requireDb();
  const [existing] = await db.select().from(dailyCloudBackups).where(and(eq(dailyCloudBackups.teacherId, teacherId), eq(dailyCloudBackups.backupDate, backupDate))).limit(1);
  if (existing) {
    const createdAt = new Date();
    await db.update(dailyCloudBackups).set({ storageKey, storageUrl, createdAt }).where(eq(dailyCloudBackups.id, existing.id));
    return { ...existing, storageKey, storageUrl, createdAt };
  }
  await db.insert(dailyCloudBackups).values({ teacherId, backupDate, storageKey, storageUrl });
  return getDailyCloudBackup(teacherId);
}

export async function createLocalTeacherSession(teacherId: number, tokenHash: string) {
  const db = await requireDb();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180);
  await db.insert(teacherSessions).values({ teacherId, tokenHash, expiresAt });
  return expiresAt;
}

export async function getLocalTeacherSession(tokenHash: string) {
  const db = await requireDb();
  const [session] = await db.select().from(teacherSessions).where(eq(teacherSessions.tokenHash, tokenHash)).limit(1);
  if (!session || session.expiresAt.getTime() < Date.now()) return undefined;
  return session;
}

export async function deleteLocalTeacherSession(tokenHash: string) {
  const db = await requireDb();
  await db.delete(teacherSessions).where(eq(teacherSessions.tokenHash, tokenHash));
}

export function normalizeStudentName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
}

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function listAttendanceForStudent(studentId: number): Promise<AttendanceRecord[]> {
  const db = await requireDb();
  return db.select({ dateKey: attendance.dateKey, morningAbsent: attendance.morningAbsent, eveningAbsent: attendance.eveningAbsent }).from(attendance).where(eq(attendance.studentId, studentId)).orderBy(asc(attendance.dateKey));
}

export async function toggleAttendanceForTeacher(teacherId: number, studentId: number, period: "morning" | "evening") {
  const db = await requireDb();
  const student = await getStudentForTeacher(teacherId, studentId);
  if (!student) throw new Error("الطالب غير موجود أو لا تملك صلاحية تعديل غيابه");
  const dateKey = currentDateKey();
  const [existing] = await db.select().from(attendance).where(and(eq(attendance.studentId, studentId), eq(attendance.dateKey, dateKey))).limit(1);
  const nextMorning = period === "morning" ? !(existing?.morningAbsent ?? false) : (existing?.morningAbsent ?? false);
  const nextEvening = period === "evening" ? !(existing?.eveningAbsent ?? false) : (existing?.eveningAbsent ?? false);
  if (existing && !nextMorning && !nextEvening) await db.delete(attendance).where(eq(attendance.id, existing.id));
  else if (existing) await db.update(attendance).set({ morningAbsent: nextMorning, eveningAbsent: nextEvening }).where(eq(attendance.id, existing.id));
  else await db.insert(attendance).values({ studentId, dateKey, morningAbsent: nextMorning, eveningAbsent: nextEvening });
  return { studentId, dateKey, morningAbsent: nextMorning, eveningAbsent: nextEvening };
}

export async function listStudentsForTeacher(teacherId: number) {
  const db = await requireDb();
  const studentRows = await db
    .select({
      id: students.id,
      name: students.name,
      age: students.age,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
    })
    .from(students)
    .where(eq(students.teacherId, teacherId))
    .orderBy(asc(students.name));
  if (!studentRows.length) return [];
  const todayAttendance = await db.select().from(attendance).where(and(eq(attendance.dateKey, currentDateKey()), inArray(attendance.studentId, studentRows.map((student) => student.id))));
  const statusByStudent = new Map(todayAttendance.map((record) => [record.studentId, record]));
  return studentRows.map((student) => {
    const status = statusByStudent.get(student.id);
    return { ...student, morningAbsent: status?.morningAbsent ?? false, eveningAbsent: status?.eveningAbsent ?? false };
  });
}

export async function createStudent(data: InsertStudent) {
  const db = await requireDb();
  await db.insert(students).values(data);
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.teacherId, data.teacherId),
        eq(students.name, data.name),
        eq(students.normalizedName, data.normalizedName),
      ),
    )
    .orderBy(desc(students.id))
    .limit(1);
  if (!student) throw new Error("تعذر إنشاء سجل الطالب");
  return student;
}

export async function updateStudentForTeacher(
  teacherId: number,
  studentId: number,
  data: Partial<Pick<InsertStudent, "name" | "normalizedName" | "age" | "parentPinHash">>,
) {
  const db = await requireDb();
  await db.update(students).set(data).where(and(eq(students.id, studentId), eq(students.teacherId, teacherId)));
  return getStudentForTeacher(teacherId, studentId);
}

export async function deleteStudentForTeacher(teacherId: number, studentId: number) {
  const db = await requireDb();
  const student = await getStudentForTeacher(teacherId, studentId);
  if (!student) throw new Error("الطالب غير موجود أو لا تملك صلاحية حذفه");
  await db.delete(messages).where(eq(messages.studentId, studentId));
  await db.delete(monthlyBoards).where(eq(monthlyBoards.studentId, studentId));
  await db.delete(parentSessions).where(eq(parentSessions.studentId, studentId));
  await db.delete(attendance).where(eq(attendance.studentId, studentId));
  await db.delete(students).where(eq(students.id, studentId));
}

export async function getStudentForTeacher(teacherId: number, studentId: number) {
  const db = await requireDb();
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacherId)))
    .limit(1);
  return student;
}

export async function getStudentForTeacherById(studentId: number) {
  const db = await requireDb();
  const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
  return student;
}

export async function getBoardsForStudent(studentId: number): Promise<ParsedBoard[]> {
  const db = await requireDb();
  const boardRows = await db
    .select()
    .from(monthlyBoards)
    .where(eq(monthlyBoards.studentId, studentId))
    .orderBy(desc(monthlyBoards.monthKey));
  return boardRows.map(toParsedBoard);
}

export type BackupStudentPayload = {
  name: string;
  age: number;
  parentPinHash: string;
  boards: { monthKey: string; label: string; elements: BoardElement[]; canvasHeight: number; themeKey: string; themeColors: { canvas: string; accent: string; ink: string; gold: string } | null }[];
  messages: { senderRole: "teacher" | "parent"; content: string; isNote: boolean; createdAt: string }[];
  attendance: AttendanceRecord[];
};

export async function exportTeacherBackup(teacherId: number) {
  const db = await requireDb();
  const studentRows = await db.select().from(students).where(eq(students.teacherId, teacherId)).orderBy(asc(students.name));
  const backupStudents = await Promise.all(studentRows.map(async (student) => {
    const [boards, messageList, attendanceRows] = await Promise.all([getBoardsForStudent(student.id), listMessagesForStudent(student.id), listAttendanceForStudent(student.id)]);
    return {
      name: student.name,
      age: student.age,
      parentPinHash: student.parentPinHash,
      boards: boards.map((board) => ({ monthKey: board.monthKey, label: board.label, elements: board.elements, canvasHeight: board.canvasHeight, themeKey: board.themeKey, themeColors: board.themeColors })),
      messages: messageList.map((message) => ({ senderRole: message.senderRole as "teacher" | "parent", content: message.content, isNote: message.isNote, createdAt: message.createdAt.toISOString() })),
      attendance: attendanceRows,
    };
  }));
  return { formatVersion: 1, exportedAt: new Date().toISOString(), students: backupStudents };
}

export async function importTeacherBackup(teacherId: number, backupStudents: BackupStudentPayload[]) {
  const db = await requireDb();
  let studentsImported = 0;
  let boardsImported = 0;
  let messagesImported = 0;
  for (const record of backupStudents) {
    const normalizedName = normalizeStudentName(record.name);
    const [existing] = await db.select().from(students).where(and(eq(students.teacherId, teacherId), eq(students.normalizedName, normalizedName))).limit(1);
    if (existing) continue;
    await db.insert(students).values({ teacherId, name: record.name, normalizedName, age: record.age, parentPinHash: record.parentPinHash });
    const [student] = await db.select().from(students).where(and(eq(students.teacherId, teacherId), eq(students.normalizedName, normalizedName))).orderBy(desc(students.id)).limit(1);
    if (!student) throw new Error("تعذر استعادة طالب من النسخة الاحتياطية");
    studentsImported += 1;
    for (const board of record.boards) {
      await db.insert(monthlyBoards).values({ studentId: student.id, monthKey: board.monthKey, label: board.label, elementsJson: JSON.stringify(board.elements), canvasHeight: board.canvasHeight, themeKey: board.themeKey, themeJson: board.themeColors ? JSON.stringify(board.themeColors) : null });
      boardsImported += 1;
    }
    for (const message of record.messages) {
      await db.insert(messages).values({ studentId: student.id, senderRole: message.senderRole, content: message.content, isNote: message.isNote, createdAt: new Date(message.createdAt) });
      messagesImported += 1;
    }
    for (const attendanceRecord of record.attendance ?? []) {
      await db.insert(attendance).values({ studentId: student.id, dateKey: attendanceRecord.dateKey, morningAbsent: attendanceRecord.morningAbsent, eveningAbsent: attendanceRecord.eveningAbsent });
    }
  }
  return { studentsImported, boardsImported, messagesImported };
}

export async function saveBoardForTeacher(
  teacherId: number,
  studentId: number,
  monthKey: string,
  label: string,
  elements: BoardElement[],
  canvasHeight: number,
  themeKey: string,
  themeColors: { canvas: string; accent: string; ink: string; gold: string } | null,
) {
  const db = await requireDb();
  const student = await getStudentForTeacher(teacherId, studentId);
  if (!student) throw new Error("الطالب غير موجود أو لا تملك صلاحية تعديل ملفه");
  const elementsJson = JSON.stringify(elements);
  const themeJson = themeColors ? JSON.stringify(themeColors) : null;
  const [existing] = await db
    .select()
    .from(monthlyBoards)
    .where(and(eq(monthlyBoards.studentId, studentId), eq(monthlyBoards.monthKey, monthKey)))
    .limit(1);
  if (existing) {
    await db.update(monthlyBoards).set({ label, elementsJson, canvasHeight, themeKey, themeJson }).where(eq(monthlyBoards.id, existing.id));
    return { ...existing, label, canvasHeight, themeKey, themeJson, themeColors: parseThemeColors(themeJson), elements: parseElements(elementsJson), elementsJson };
  }
  await db.insert(monthlyBoards).values({ studentId, monthKey, label, elementsJson, canvasHeight, themeKey, themeJson });
  const [created] = await db
    .select()
    .from(monthlyBoards)
    .where(and(eq(monthlyBoards.studentId, studentId), eq(monthlyBoards.monthKey, monthKey)))
    .limit(1);
  if (!created) throw new Error("تعذر حفظ السبورة");
  return toParsedBoard(created);
}

export async function listMessagesForStudent(studentId: number) {
  const db = await requireDb();
  return db.select().from(messages).where(eq(messages.studentId, studentId)).orderBy(asc(messages.createdAt));
}

export async function createMessage(data: {
  studentId: number;
  senderRole: "teacher" | "parent";
  content: string;
  isNote?: boolean;
}) {
  const db = await requireDb();
  await db.insert(messages).values({ ...data, isNote: data.isNote ?? false });
  const [created] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.studentId, data.studentId),
        eq(messages.senderRole, data.senderRole),
        eq(messages.content, data.content),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);
  if (!created) throw new Error("تعذر حفظ الرسالة");
  return created;
}

export async function findStudentByParentCredentials(normalizedName: string, pinHash: string) {
  const db = await requireDb();
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.normalizedName, normalizedName), eq(students.parentPinHash, pinHash)))
    .limit(1);
  return student;
}

export async function createParentSession(studentId: number, tokenHash: string, pushToken?: string) {
  const db = await requireDb();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);
  await db.insert(parentSessions).values({ studentId, tokenHash, pushToken: pushToken || null, expiresAt });
  return expiresAt;
}

export async function getParentSession(tokenHash: string) {
  const db = await requireDb();
  const [session] = await db
    .select()
    .from(parentSessions)
    .where(and(eq(parentSessions.tokenHash, tokenHash), gt(parentSessions.expiresAt, new Date())))
    .limit(1);
  if (session) await db.update(parentSessions).set({ lastSeenAt: new Date() }).where(eq(parentSessions.id, session.id));
  return session;
}

export async function updateParentPushToken(tokenHash: string, pushToken: string) {
  const db = await requireDb();
  await db.update(parentSessions).set({ pushToken, lastSeenAt: new Date() }).where(eq(parentSessions.tokenHash, tokenHash));
}

export async function deleteParentSession(tokenHash: string) {
  const db = await requireDb();
  await db.delete(parentSessions).where(eq(parentSessions.tokenHash, tokenHash));
}

export async function listPushTokensForStudent(studentId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ pushToken: parentSessions.pushToken })
    .from(parentSessions)
    .where(and(eq(parentSessions.studentId, studentId), gt(parentSessions.expiresAt, new Date())));
  return rows.flatMap((row) => (row.pushToken ? [row.pushToken] : []));
}
