import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const key = "quran-school-supabase-teacher-session";

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

export async function loadCloudTeacherSession(): Promise<string | null> {
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
    console.warn("[CloudTeacherSession] Failed to load session:", error);
    return null;
  }
}

export async function saveCloudTeacherSession(token: unknown): Promise<void> {
  try {
    const value = extractTokenString(token);
    if (!value) {
      console.warn("[CloudTeacherSession] Attempted to save empty token. Clearing session instead.");
      await clearCloudTeacherSession();
      return;
    }

    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (error) {
    console.error("[CloudTeacherSession] Failed to save session token:", error);
    throw error;
  }
}

export async function clearCloudTeacherSession(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (error) {
    console.warn("[CloudTeacherSession] Failed to clear session:", error);
  }
}

