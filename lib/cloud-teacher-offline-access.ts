import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const accessKey = "quran-school-supabase-teacher-offline-access";

type OfflineTeacherAccess = { pinHash: string; sessionToken: string; verifiedAt: string };

async function hashPin(pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

async function readRaw() {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(accessKey) ?? null;
  return SecureStore.getItemAsync(accessKey);
}

async function writeRaw(value: string) {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(accessKey, value);
  else await SecureStore.setItemAsync(accessKey, value);
}

export async function saveOfflineTeacherAccess(pin: string, sessionToken: string) {
  const access: OfflineTeacherAccess = { pinHash: await hashPin(pin), sessionToken, verifiedAt: new Date().toISOString() };
  await writeRaw(JSON.stringify(access));
}

export async function unlockOfflineTeacherAccess(pin: string): Promise<string | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const access = JSON.parse(raw) as Partial<OfflineTeacherAccess>;
    if (!access.pinHash || !access.sessionToken || access.pinHash !== await hashPin(pin)) return null;
    return access.sessionToken;
  } catch {
    return null;
  }
}
