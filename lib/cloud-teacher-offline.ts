import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

import { queueTeacherOfflineMutation, type TeacherOfflineMutation, type TeacherOfflineMutationInput } from "@/lib/cloud-teacher-offline-queue";
import { supabaseSchool, type SchoolAttendance, type SchoolBoard, type SchoolMessage, type SchoolStudent } from "@/lib/supabase-school-api";

export { queueTeacherOfflineMutation } from "@/lib/cloud-teacher-offline-queue";
export type { TeacherOfflineMutation, TeacherOfflineMutationInput } from "@/lib/cloud-teacher-offline-queue";

const OFFLINE_CACHE_KEY = "quran-school-supabase-teacher-offline-v1";

export type CachedTeacherDetail = {
  student: SchoolStudent;
  boards: SchoolBoard[];
  attendance: SchoolAttendance[];
  messages: SchoolMessage[];
};

export type TeacherOfflineCache = {
  students: SchoolStudent[];
  attendance: SchoolAttendance[];
  details: Record<string, CachedTeacherDetail>;
  queue: TeacherOfflineMutation[];
  updatedAt: string | null;
};

const emptyCache = (): TeacherOfflineCache => ({ students: [], attendance: [], details: {}, queue: [], updatedAt: null });

let memoryCache: TeacherOfflineCache | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneCache(cache: TeacherOfflineCache): TeacherOfflineCache {
  return JSON.parse(JSON.stringify(cache)) as TeacherOfflineCache;
}

function randomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

async function readCache(): Promise<TeacherOfflineCache> {
  if (memoryCache) return cloneCache(memoryCache);
  const raw = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
  if (!raw) {
    memoryCache = emptyCache();
    return cloneCache(memoryCache);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TeacherOfflineCache>;
    memoryCache = {
      students: Array.isArray(parsed.students) ? parsed.students : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
      details: parsed.details && typeof parsed.details === "object" ? parsed.details : {},
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    memoryCache = emptyCache();
  }
  return cloneCache(memoryCache);
}

async function updateCache(mutator: (current: TeacherOfflineCache) => TeacherOfflineCache): Promise<TeacherOfflineCache> {
  let next!: TeacherOfflineCache;
  writeChain = writeChain.then(async () => {
    const current = await readCache();
    next = mutator(current);
    memoryCache = cloneCache(next);
    await AsyncStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(memoryCache));
  });
  await writeChain;
  return cloneCache(next);
}

export async function loadTeacherOfflineCache(): Promise<TeacherOfflineCache> {
  await writeChain;
  return readCache();
}

export async function loadCachedTeacherDetail(studentId: string): Promise<CachedTeacherDetail | null> {
  const cache = await loadTeacherOfflineCache();
  const detail = cache.details[studentId];
  if (detail) return detail;
  const student = cache.students.find((item) => item.id === studentId);
  if (!student) return null;
  return { student, boards: [], attendance: cache.attendance.filter((item) => item.student_id === studentId), messages: [] };
}

export async function isTeacherInternetAvailable(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isInternetReachable !== false;
}

export async function cacheTeacherSnapshot(snapshot: { students: SchoolStudent[]; boards?: SchoolBoard[]; attendance: SchoolAttendance[]; messages?: SchoolMessage[] }): Promise<void> {
  await updateCache((current) => {
    const boards = snapshot.boards;
    const messages = snapshot.messages;
    const details = boards && messages
      ? Object.fromEntries(snapshot.students.map((student) => [student.id, {
          student,
          boards: boards.filter((board) => board.student_id === student.id),
          attendance: snapshot.attendance.filter((record) => record.student_id === student.id),
          messages: messages.filter((message) => message.student_id === student.id),
        }]))
      : current.details;
    return { ...current, students: snapshot.students, attendance: snapshot.attendance, details, updatedAt: new Date().toISOString() };
  });
}

export async function cacheTeacherDetail(detail: CachedTeacherDetail): Promise<void> {
  await updateCache((current) => ({
    ...current,
    students: [...current.students.filter((student) => student.id !== detail.student.id), detail.student],
    attendance: [...current.attendance.filter((record) => record.student_id !== detail.student.id), ...detail.attendance],
    details: { ...current.details, [detail.student.id]: detail },
    updatedAt: new Date().toISOString(),
  }));
}

export async function cacheStudent(student: SchoolStudent): Promise<void> {
  await updateCache((current) => ({
    ...current,
    students: [...current.students.filter((item) => item.id !== student.id), student],
    details: current.details[student.id] ? { ...current.details, [student.id]: { ...current.details[student.id], student } } : current.details,
    updatedAt: new Date().toISOString(),
  }));
}

export async function cacheAttendanceRecord(record: SchoolAttendance): Promise<void> {
  await updateCache((current) => ({
    ...current,
    attendance: [...current.attendance.filter((item) => item.student_id !== record.student_id || item.date_key !== record.date_key), record],
    details: current.details[record.student_id]
      ? {
          ...current.details,
          [record.student_id]: {
            ...current.details[record.student_id],
            attendance: [...current.details[record.student_id].attendance.filter((item) => item.student_id !== record.student_id || item.date_key !== record.date_key), record],
          },
        }
      : current.details,
    updatedAt: new Date().toISOString(),
  }));
}

export async function cacheBoardRecord(board: SchoolBoard): Promise<void> {
  await updateCache((current) => {
    const detail = current.details[board.student_id];
    return {
      ...current,
      details: detail
        ? { ...current.details, [board.student_id]: { ...detail, boards: [...detail.boards.filter((item) => item.month_key !== board.month_key), board] } }
        : current.details,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function cacheTeacherMessage(message: SchoolMessage): Promise<void> {
  await updateCache((current) => {
    const detail = current.details[message.student_id];
    return {
      ...current,
      details: detail
        ? { ...current.details, [message.student_id]: { ...detail, messages: [...detail.messages.filter((item) => item.id !== message.id), message] } }
        : current.details,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function removeCachedTeacherStudent(studentId: string): Promise<void> {
  await updateCache((current) => {
    const details = { ...current.details };
    delete details[studentId];
    return {
      ...current,
      students: current.students.filter((student) => student.id !== studentId),
      attendance: current.attendance.filter((record) => record.student_id !== studentId),
      details,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function enqueueTeacherMutation(mutation: TeacherOfflineMutationInput): Promise<void> {
  await updateCache((current) => ({ ...current, queue: queueTeacherOfflineMutation(current.queue, { ...mutation, id: randomId() } as TeacherOfflineMutation), updatedAt: new Date().toISOString() }));
}

export async function flushTeacherOfflineQueue(sessionToken: string): Promise<number> {
  const cache = await loadTeacherOfflineCache();
  let completed = 0;
  for (const mutation of cache.queue) {
    if (mutation.type === "upsertStudent") {
      try {
        await supabaseSchool.upsertStudent(sessionToken, mutation.student);
      } catch (error) {
        const isLocalCreate = mutation.student.clientId === mutation.student.id && typeof mutation.student.parentPin === "string";
        const message = error instanceof Error ? error.message : "";
        if (!isLocalCreate || !message.includes("الطالب غير موجود")) throw error;
        const { id: _localId, clientId: _clientId, ...serverStudent } = mutation.student;
        await supabaseSchool.upsertStudent(sessionToken, serverStudent);
      }
    } else if (mutation.type === "deleteStudent") {
      await supabaseSchool.deleteStudent(sessionToken, mutation.studentId);
    } else if (mutation.type === "saveBoard") {
      await supabaseSchool.saveBoard(sessionToken, mutation.studentId, mutation.board);
    } else if (mutation.type === "setAttendance") {
      await supabaseSchool.setAttendance(sessionToken, mutation.studentId, mutation.period, mutation.dateKey, mutation.absent);
    } else if (mutation.type === "sendMessage") {
      await supabaseSchool.sendTeacherMessage(sessionToken, mutation.studentId, mutation.content, mutation.isNote, mutation.clientMessageId);
    } else if (mutation.type === "sendWeekReminder") {
      await supabaseSchool.sendWeekReminder(sessionToken, mutation.studentId, mutation.monthKey, mutation.weekNumber, mutation.clientReminderId);
    } else {
      await supabaseSchool.markTeacherMessagesRead(sessionToken, mutation.studentId);
    }
    completed += 1;
    await updateCache((current) => ({ ...current, queue: current.queue.filter((item) => item.id !== mutation.id), updatedAt: new Date().toISOString() }));
  }
  return completed;
}

export function createOfflineId(): string {
  return randomId();
}
