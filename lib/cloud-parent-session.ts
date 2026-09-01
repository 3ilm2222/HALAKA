import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "quran-school-supabase-parent-session";

export async function loadCloudParentSession() {
  return Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key);
}

export async function saveCloudParentSession(token: string) {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(key, token);
  else await SecureStore.setItemAsync(key, token);
}

export async function clearCloudParentSession() {
  if (Platform.OS === "web") globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
