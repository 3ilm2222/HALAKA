import * as db from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function createDailyCloudBackup(teacherId: number) {
  const dateKey = currentDateKey();
  const payload = await db.exportTeacherBackup(teacherId);
  const stored = await storagePut(
    `quran-school-backups/${teacherId}/daily-${dateKey}.json`,
    JSON.stringify(payload),
    "application/json",
  );
  const backup = await db.saveDailyCloudBackup(teacherId, dateKey, stored.key, stored.url);
  return { backupDate: dateKey, backup };
}

export async function restoreLatestCloudBackup(teacherId: number) {
  const backup = await db.getDailyCloudBackup(teacherId);
  if (!backup) throw new Error("لا توجد نسخة سحابية محفوظة بعد");
  const signedUrl = await storageGetSignedUrl(backup.storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("تعذر تنزيل النسخة السحابية");
  const payload = await response.json() as { students?: db.BackupStudentPayload[] };
  if (!Array.isArray(payload.students)) throw new Error("ملف النسخة السحابية غير صالح");
  const restored = await db.importTeacherBackup(teacherId, payload.students);
  return { ...restored, backupDate: backup.backupDate };
}

export async function createDailyBackupForConfiguredTeacher() {
  const access = await db.getLocalTeacherAccess();
  if (!access) throw new Error("لم يتم إعداد حساب المعلم بعد");
  return createDailyCloudBackup(access.teacherId);
}
