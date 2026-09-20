import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TEACHER_SESSION_KEY = "quran_school_teacher_session";

function webStore() {
  return typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : null;
}

export async function saveTeacherSessionToken(token: unknown) {
  const strToken = typeof token === "string" ? token.trim() : token ? JSON.stringify(token) : "";
  if (!strToken) {
    await clearTeacherSessionToken();
    return;
  }
  if (Platform.OS === "web") {
    webStore()?.setItem(TEACHER_SESSION_KEY, strToken);
    return;
  }
  await SecureStore.setItemAsync(TEACHER_SESSION_KEY, strToken);
}

export async function loadTeacherSessionToken() {
  if (Platform.OS === "web") return webStore()?.getItem(TEACHER_SESSION_KEY) ?? null;
  return SecureStore.getItemAsync(TEACHER_SESSION_KEY);
}

export async function clearTeacherSessionToken() {
  if (Platform.OS === "web") {
    webStore()?.removeItem(TEACHER_SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TEACHER_SESSION_KEY);
}
