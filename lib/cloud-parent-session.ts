import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "quran-school-supabase-parent-session";
const snapshotCacheKey = "@quran-school-parent-cached-snapshot";

function extractTokenString(token: unknown): string {
  if (typeof token === "string") {
    return token.trim();
  }
  if (token && typeof token === "object") {
    if ("sessionToken" in token && typeof (token as Record<string, unknown>).sessionToken === "string") {
      return ((token as Record<string, unknown>).sessionToken as string).trim();
    }
    if ("token" in token && typeof (token as Record<string, unknown>).token === "string") {
      return ((token as Record<string, unknown>).token as string).trim();
    }
    try {
      return JSON.stringify(token);
    } catch {
      return "";
    }
  }
  return "";
}

export async function loadCloudParentSession(): Promise<string | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(key) ?? null
        : await SecureStore.getItemAsync(key);

    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed?.sessionToken === "string" && parsed.sessionToken.trim()) {
          return parsed.sessionToken.trim();
        }
        if (typeof parsed?.token === "string" && parsed.token.trim()) {
          return parsed.token.trim();
        }
      } catch {
        // Raw plain string
      }
    }
    return trimmed;
  } catch (error) {
    console.warn("[CloudParentSession] Failed to load session:", error);
    return null;
  }
}

export async function saveCloudParentSession(token: unknown): Promise<void> {
  try {
    const value = extractTokenString(token);
    if (!value) {
      console.warn("[CloudParentSession] Attempted to save empty token. Clearing session instead.");
      await clearCloudParentSession();
      return;
    }

    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (error) {
    console.error("[CloudParentSession] Failed to save session token:", error);
    throw error;
  }
}

export async function clearCloudParentSession(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
    await AsyncStorage.removeItem(snapshotCacheKey).catch(() => undefined);
  } catch (error) {
    console.warn("[CloudParentSession] Failed to clear session:", error);
  }
}

export async function loadCachedParentSnapshot<T = unknown>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(snapshotCacheKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveCachedParentSnapshot(snapshot: unknown): Promise<void> {
  try {
    if (!snapshot) return;
    await AsyncStorage.setItem(snapshotCacheKey, JSON.stringify(snapshot));
  } catch {
    // Non-blocking caching
  }
}

