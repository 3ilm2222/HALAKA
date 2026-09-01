import { COOKIE_NAME } from "../shared/const.js";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import type { TrpcContext } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { sendParentPushNotifications } from "./push";
import { storagePut } from "./storage";
import { createDailyCloudBackup, restoreLatestCloudBackup } from "./cloud-backup";
import { ensureDailyCloudBackupSchedule } from "./daily-backup-schedule";

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/);
const boardElementSchema = z.record(z.string(), z.unknown());
const studentInputSchema = z.object({
  name: z.string().trim().min(2, "اكتب اسم الطالب").max(160),
  age: z.number().int().min(3).max(120),
  parentPin: z.string().trim().min(4, "الرمز لا يقل عن أربعة أحرف أو أرقام").max(32),
});
const backupThemeSchema = z.object({ canvas: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), ink: z.string().regex(/^#[0-9a-fA-F]{6}$/), gold: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const backupPayloadSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  students: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    age: z.number().int().min(3).max(120),
    parentPinHash: z.string().min(32).max(128),
    boards: z.array(z.object({ monthKey: monthKeySchema, label: z.string().min(2).max(40), elements: z.array(boardElementSchema).max(300), canvasHeight: z.number().int().min(560).max(5000), themeKey: z.string().min(1).max(32), themeColors: backupThemeSchema.nullable() })).max(120),
    messages: z.array(z.object({ senderRole: z.enum(["teacher", "parent"]), content: z.string().min(1).max(1000), isNote: z.boolean(), createdAt: z.string().datetime() })).max(500),
    attendance: z.array(z.object({ dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), morningAbsent: z.boolean(), eveningAbsent: z.boolean() })).max(3660).default([]),
  })).max(1000),
});

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function requireLocalTeacher(ctx: TrpcContext) {
  const rawToken = ctx.req.headers["x-teacher-session"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!token || token.length < 20) throw new Error("سجّل دخول المعلم بالرمز أولاً");
  const session = await db.getLocalTeacherSession(hashValue(token));
  if (!session) throw new Error("انتهت جلسة المعلم، أدخل الرمز مجدداً");
  return session.teacherId;
}

async function issueLocalTeacherSession(teacherId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = await db.createLocalTeacherSession(teacherId, hashValue(token));
  return { token, expiresAt };
}

function presentStudent(student: { id: number; name: string; age: number }) {
  return { id: student.id, name: student.name, age: student.age };
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  teacherAccess: router({
    status: publicProcedure.query(async () => {
      const access = await db.getLocalTeacherAccess();
      return { configured: Boolean(access), googleLinked: Boolean(access?.googleOpenId) };
    }),
    setup: publicProcedure
      .input(z.object({ pin: z.string().trim().min(4, "الرمز لا يقل عن أربعة خانات").max(32) }))
      .mutation(async ({ input }) => issueLocalTeacherSession((await db.initializeLocalTeacher(hashValue(input.pin))).id)),
    login: publicProcedure
      .input(z.object({ pin: z.string().trim().min(4).max(32) }))
      .mutation(async ({ input }) => {
        const access = await db.verifyLocalTeacherPin(hashValue(input.pin));
        if (!access) throw new Error("رمز المعلم غير صحيح");
        return issueLocalTeacherSession(access.teacherId);
      }),
    resetPin: publicProcedure
      .input(z.object({ pin: z.string().trim().min(4, "الرمز لا يقل عن أربعة خانات").max(32) }))
      .mutation(async ({ input }) => issueLocalTeacherSession(await db.resetLocalTeacherPin(hashValue(input.pin)))),
    linkGoogle: protectedProcedure.mutation(async ({ ctx }) => {
      const teacherId = await requireLocalTeacher(ctx);
      if (!ctx.user) throw new Error("سجّل الدخول عبر Google أولاً");
      await db.linkGoogleToLocalTeacher(teacherId, ctx.user.openId);
      return { linked: true };
    }),
    loginGoogle: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user) throw new Error("تعذر التحقق من حساب Google");
      const teacherId = await db.getLocalTeacherIdByGoogle(ctx.user.openId);
      if (!teacherId) throw new Error("لم يتم ربط حساب Google هذا ببوابة المعلم بعد");
      return issueLocalTeacherSession(teacherId);
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const rawToken = ctx.req.headers["x-teacher-session"];
      const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
      if (token) await db.deleteLocalTeacherSession(hashValue(token));
      return { success: true } as const;
    }),
  }),
  students: router({
    list: publicProcedure.query(async ({ ctx }) => db.listStudentsForTeacher(await requireLocalTeacher(ctx))),
    create: publicProcedure.input(studentInputSchema).mutation(async ({ ctx, input }) => {
      const teacherId = await requireLocalTeacher(ctx);
      return db.createStudent({
        teacherId,
        name: input.name,
        normalizedName: db.normalizeStudentName(input.name),
        age: input.age,
        parentPinHash: hashValue(input.parentPin),
      });
    }),
    update: publicProcedure
      .input(z.object({ id: z.number().int().positive(), data: studentInputSchema.partial() }))
      .mutation(async ({ ctx, input }) => {
        const teacherId = await requireLocalTeacher(ctx);
        const update: { name?: string; normalizedName?: string; age?: number; parentPinHash?: string } = {};
        if (input.data.name !== undefined) {
          update.name = input.data.name;
          update.normalizedName = db.normalizeStudentName(input.data.name);
        }
        if (input.data.age !== undefined) update.age = input.data.age;
        if (input.data.parentPin !== undefined) update.parentPinHash = hashValue(input.data.parentPin);
        return db.updateStudentForTeacher(teacherId, input.id, update);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => db.deleteStudentForTeacher(await requireLocalTeacher(ctx), input.id)),
    detail: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const student = await db.getStudentForTeacher(await requireLocalTeacher(ctx), input.id);
        if (!student) throw new Error("الطالب غير موجود أو لا تملك صلاحية فتح ملفه");
        const [boards, messageList] = await Promise.all([
          db.getBoardsForStudent(student.id),
          db.listMessagesForStudent(student.id),
        ]);
        const attendance = await db.listAttendanceForStudent(student.id);
        return { student: presentStudent(student), boards, messages: messageList, attendance };
      }),
  }),
  attendance: router({
    toggle: publicProcedure.input(z.object({ studentId: z.number().int().positive(), period: z.enum(["morning", "evening"]) })).mutation(async ({ ctx, input }) => db.toggleAttendanceForTeacher(await requireLocalTeacher(ctx), input.studentId, input.period)),
  }),
  boards: router({
    save: publicProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          monthKey: monthKeySchema,
          label: z.string().trim().min(2).max(40),
          elements: z.array(boardElementSchema).max(300),
          canvasHeight: z.number().int().min(560).max(5000),
          themeKey: z.string().min(1).max(32),
          themeColors: z.object({ canvas: z.string().regex(/^#[0-9a-fA-F]{6}$/), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), ink: z.string().regex(/^#[0-9a-fA-F]{6}$/), gold: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        db.saveBoardForTeacher(await requireLocalTeacher(ctx), input.studentId, input.monthKey, input.label, input.elements, input.canvasHeight, input.themeKey, input.themeColors),
      ),
    uploadImage: publicProcedure
      .input(
        z.object({
          studentId: z.number().int().positive(),
          base64: z.string().min(20).max(4_500_000),
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const student = await db.getStudentForTeacher(await requireLocalTeacher(ctx), input.studentId);
        if (!student) throw new Error("لا تملك صلاحية رفع صورة لهذا الطالب");
        const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
        const content = Buffer.from(input.base64, "base64");
        if (content.byteLength > 3_000_000) throw new Error("يرجى اختيار صورة أصغر من 3 ميغابايت");
        return storagePut(`student-boards/${student.id}/${Date.now()}.${extension}`, content, input.mimeType);
      }),
  }),
  backup: router({
    export: publicProcedure.query(async ({ ctx }) => db.exportTeacherBackup(await requireLocalTeacher(ctx))),
    import: publicProcedure.input(backupPayloadSchema).mutation(async ({ ctx, input }) => db.importTeacherBackup(await requireLocalTeacher(ctx), input.students)),
    cloudStatus: publicProcedure.query(async ({ ctx }) => db.getDailyCloudBackup(await requireLocalTeacher(ctx))),
    createCloudNow: publicProcedure.mutation(async ({ ctx }) => createDailyCloudBackup(await requireLocalTeacher(ctx))),
    restoreCloudLatest: publicProcedure.mutation(async ({ ctx }) => restoreLatestCloudBackup(await requireLocalTeacher(ctx))),
    enableDailyCloud: publicProcedure.mutation(async ({ ctx }) => {
      await requireLocalTeacher(ctx);
      return ensureDailyCloudBackupSchedule();
    }),
  }),
  messages: router({
    teacherNote: publicProcedure
      .input(z.object({ studentId: z.number().int().positive(), content: z.string().trim().min(1).max(1000) }))
      .mutation(async ({ ctx, input }) => {
        const student = await db.getStudentForTeacher(await requireLocalTeacher(ctx), input.studentId);
        if (!student) throw new Error("الطالب غير موجود أو لا تملك صلاحية مراسلة ولي أمره");
        const message = await db.createMessage({
          studentId: input.studentId,
          senderRole: "teacher",
          content: input.content,
          isNote: true,
        });
        const pushTokens = await db.listPushTokensForStudent(input.studentId);
        const notification = await sendParentPushNotifications(
          pushTokens.map((token) => ({
            token,
            title: `ملاحظة تخص ${student.name}`,
            body: input.content.slice(0, 120),
            studentId: student.id,
          })),
        );
        return { message, notification };
      }),
  }),
  parent: router({
    login: publicProcedure
      .input(z.object({ name: z.string().trim().min(2).max(160), pin: z.string().trim().min(4).max(32) }))
      .mutation(async ({ input }) => {
        const student = await db.findStudentByParentCredentials(
          db.normalizeStudentName(input.name),
          hashValue(input.pin),
        );
        if (!student) throw new Error("اسم الطالب أو الرمز السري غير صحيح");
        const token = randomBytes(32).toString("base64url");
        const expiresAt = await db.createParentSession(student.id, hashValue(token));
        return { token, expiresAt, student: presentStudent(student) };
      }),
    dashboard: publicProcedure
      .input(z.object({ token: z.string().min(20).max(120) }))
      .query(async ({ input }) => {
        const session = await db.getParentSession(hashValue(input.token));
        if (!session) throw new Error("انتهت جلسة الدخول، يرجى تسجيل الدخول مجدداً");
        const [student, boards, messageList] = await Promise.all([
          db.getStudentForTeacherById(session.studentId),
          db.getBoardsForStudent(session.studentId),
          db.listMessagesForStudent(session.studentId),
        ]);
        if (!student) throw new Error("ملف الطالب لم يعد متاحاً");
        const attendance = await db.listAttendanceForStudent(student.id);
        return { student: presentStudent(student), boards, messages: messageList, attendance };
      }),
    sendMessage: publicProcedure
      .input(z.object({ token: z.string().min(20).max(120), content: z.string().trim().min(1).max(1000) }))
      .mutation(async ({ input }) => {
        const session = await db.getParentSession(hashValue(input.token));
        if (!session) throw new Error("انتهت جلسة الدخول، يرجى تسجيل الدخول مجدداً");
        return db.createMessage({ studentId: session.studentId, senderRole: "parent", content: input.content });
      }),
    registerPushToken: publicProcedure
      .input(z.object({ token: z.string().min(20).max(120), pushToken: z.string().min(10).max(255) }))
      .mutation(async ({ input }) => {
        const session = await db.getParentSession(hashValue(input.token));
        if (!session) throw new Error("انتهت جلسة الدخول، يرجى تسجيل الدخول مجدداً");
        await db.updateParentPushToken(hashValue(input.token), input.pushToken);
        return { success: true };
      }),
    logout: publicProcedure
      .input(z.object({ token: z.string().min(20).max(120) }))
      .mutation(({ input }) => db.deleteParentSession(hashValue(input.token))),
  }),
});

export type AppRouter = typeof appRouter;
