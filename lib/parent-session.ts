import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PARENT_SESSION_KEY = "quran_school_parent_session";

export type ParentSession = {
  token: string;
  studentId: number;
  studentName: string;
};

async function setRaw(value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(PARENT_SESSION_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(PARENT_SESSION_KEY, value);
}

async function getRaw() {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(PARENT_SESSION_KEY) ?? null;
  return SecureStore.getItemAsync(PARENT_SESSION_KEY);
}

export async function saveParentSession(session: ParentSession) {
  await setRaw(JSON.stringify(session));
}

export async function loadParentSession(): Promise<ParentSession | null> {
  const value = await getRaw();
  if (!value) return null;
  try {
    const session = JSON.parse(value) as ParentSession;
    return session.token && session.studentId ? session : null;
  } catch {
    return null;
  }
}

export async function clearParentSession() {
  if (Platform.OS === "web") {
    globalThis.localStorage?.removeItem(PARENT_SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(PARENT_SESSION_KEY);
}
