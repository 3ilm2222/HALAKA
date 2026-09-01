import { boolean, index, int, longtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const teacherAccess = mysqlTable("teacher_access", {
  id: int("id").primaryKey(),
  teacherId: int("teacherId").notNull(),
  pinHash: varchar("pinHash", { length: 128 }).notNull(),
  googleOpenId: varchar("googleOpenId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const teacherSessions = mysqlTable(
  "teacher_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacherId").notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("teacher_sessions_token_unique").on(table.tokenHash),
    index("teacher_sessions_teacher_idx").on(table.teacherId),
  ],
);

export const students = mysqlTable(
  "students",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacherId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    normalizedName: varchar("normalizedName", { length: 160 }).notNull(),
    age: int("age").notNull(),
    parentPinHash: varchar("parentPinHash", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("students_teacher_idx").on(table.teacherId),
    index("students_parent_lookup_idx").on(table.normalizedName),
  ],
);

export const attendance = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    dateKey: varchar("dateKey", { length: 10 }).notNull(),
    morningAbsent: boolean("morningAbsent").default(false).notNull(),
    eveningAbsent: boolean("eveningAbsent").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("attendance_student_date_unique").on(table.studentId, table.dateKey),
    index("attendance_student_date_idx").on(table.studentId, table.dateKey),
  ],
);

export const dailyCloudBackups = mysqlTable(
  "daily_cloud_backups",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacherId").notNull(),
    backupDate: varchar("backupDate", { length: 10 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_cloud_backups_teacher_date_unique").on(table.teacherId, table.backupDate),
    index("daily_cloud_backups_teacher_created_idx").on(table.teacherId, table.createdAt),
  ],
);

export const monthlyBoards = mysqlTable(
  "monthly_boards",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    label: varchar("label", { length: 40 }).notNull(),
    elementsJson: longtext("elementsJson").notNull(),
    canvasHeight: int("canvasHeight").default(560).notNull(),
    themeKey: varchar("themeKey", { length: 32 }).default("classic").notNull(),
    themeJson: longtext("themeJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("boards_student_idx").on(table.studentId),
    uniqueIndex("boards_student_month_unique").on(table.studentId, table.monthKey),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    senderRole: mysqlEnum("senderRole", ["teacher", "parent"]).notNull(),
    content: text("content").notNull(),
    isNote: boolean("isNote").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    readAt: timestamp("readAt"),
  },
  (table) => [index("messages_student_created_idx").on(table.studentId, table.createdAt)],
);

export const parentSessions = mysqlTable(
  "parent_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    pushToken: varchar("pushToken", { length: 255 }),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("parent_sessions_token_unique").on(table.tokenHash),
    index("parent_sessions_student_idx").on(table.studentId),
  ],
);

export type Student = typeof students.$inferSelect;
export type InsertStudent = typeof students.$inferInsert;
export type DailyCloudBackup = typeof dailyCloudBackups.$inferSelect;
export type MonthlyBoard = typeof monthlyBoards.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ParentSession = typeof parentSessions.$inferSelect;
export type TeacherAccess = typeof teacherAccess.$inferSelect;
export type TeacherSession = typeof teacherSessions.$inferSelect;
