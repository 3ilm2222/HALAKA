import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "quran-school-supabase-teacher-session";

export async function loadCloudTeacherSession() {
  return Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key);
}

export async function saveCloudTeacherSession(token: string) {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(key, token);
  else await SecureStore.setItemAsync(key, token);
}

export async function clearCloudTeacherSession() {
  if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
