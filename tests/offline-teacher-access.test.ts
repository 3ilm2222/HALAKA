import { beforeEach, describe, expect, it, vi } from "vitest";

const secureValues = new Map<string, string>();

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: string, value: string) => `digest:${value}`,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secureValues.set(key, value); },
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { saveOfflineTeacherAccess, unlockOfflineTeacherAccess } from "../lib/cloud-teacher-offline-access";

describe("دخول المعلم دون اتصال", () => {
  beforeEach(() => secureValues.clear());

  it("يفتح الجلسة المحلية بالرمز الذي تحقق منه المعلم سابقاً", async () => {
    await saveOfflineTeacherAccess("1234", "saved-session-token");

    await expect(unlockOfflineTeacherAccess("1234")).resolves.toBe("saved-session-token");
  });

  it("يرفض رمزاً مختلفاً ولا يفتح الجلسة المحلية", async () => {
    await saveOfflineTeacherAccess("1234", "saved-session-token");

    await expect(unlockOfflineTeacherAccess("0000")).resolves.toBeNull();
  });
});
