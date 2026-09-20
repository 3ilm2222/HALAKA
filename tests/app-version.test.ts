import { describe, expect, it } from "vitest";

import {
  compareSemver,
  isUpdateAvailable,
  isValidDownloadUrl,
  normalizeDownloadUrl,
  toEnglishDigits,
} from "../lib/app-version";

describe("التحقق من إصدارات التطبيق وتحديثاته", () => {
  it("يقارن صيغ الإصدارات الدلالية بدقة (Semantic Versioning)", () => {
    expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("v1.2.3", "1.2.2")).toBe(1);
    expect(compareSemver("١.٢.٠", "1.1.0")).toBe(1);
  });

  it("يحول الأرقام العربية إلى إنجليزية بدقة", () => {
    expect(toEnglishDigits("١.٢.٠")).toBe("1.2.0");
    expect(toEnglishDigits("٣")).toBe("3");
    expect(toEnglishDigits("123")).toBe("123");
  });

  it("يتحقق من صحة رابط التحميل المباشر ويعالجه بذكاء", () => {
    expect(isValidDownloadUrl("https://example.com/app.apk")).toBe(true);
    expect(isValidDownloadUrl("http://drive.google.com/file")).toBe(true);
    expect(isValidDownloadUrl("drive.google.com/file/d/123")).toBe(true);
    expect(isValidDownloadUrl("mediafire.com/download/app.apk")).toBe(true);
    expect(normalizeDownloadUrl("drive.google.com/file")).toBe("https://drive.google.com/file");
    expect(isValidDownloadUrl("")).toBe(false);
    expect(isValidDownloadUrl("ftp://invalid")).toBe(false);
    expect(isValidDownloadUrl("not-a-url")).toBe(false);
  });

  it("يظهر التحديث للولي إذا كان تطبيقه غير محدث ويوفر رابطاً صالحاً", () => {
    const current = { versionName: "1.0.0", versionCode: 1 };
    const latest = {
      latestVersionName: "1.1.0",
      latestVersionCode: 2,
      downloadUrl: "https://example.com/releases/app-v1.1.0.apk",
      releaseNotes: "تحسينات جديدة وسرعة في الحفظ",
    };

    expect(isUpdateAvailable(current, latest)).toBe(true);
  });

  it("لا يظهر أي تحديث للولي إذا كان تطبيقه محدثاً بنفس رقم الإصدار", () => {
    const current = { versionName: "1.1.0", versionCode: 2 };
    const latest = {
      latestVersionName: "1.1.0",
      latestVersionCode: 2,
      downloadUrl: "https://example.com/releases/app-v1.1.0.apk",
    };

    expect(isUpdateAvailable(current, latest)).toBe(false);
  });

  it("لا يظهر أي تحديث للولي إذا كان تطبيقه أعلى من الإصدار المسجل", () => {
    const current = { versionName: "1.2.0", versionCode: 3 };
    const latest = {
      latestVersionName: "1.1.0",
      latestVersionCode: 2,
      downloadUrl: "https://example.com/releases/app-v1.1.0.apk",
    };

    expect(isUpdateAvailable(current, latest)).toBe(false);
  });

  it("لا يظهر أي تحديث إذا لم يضع المعلم رابط تحميل مباشر", () => {
    const current = { versionName: "1.0.0", versionCode: 1 };
    const latest = {
      latestVersionName: "1.1.0",
      latestVersionCode: 2,
      downloadUrl: "",
    };

    expect(isUpdateAvailable(current, latest)).toBe(false);
  });
});
