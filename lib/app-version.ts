let detectedVersion = "1.0.0";
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require("expo-constants");
  const config = Constants.default?.expoConfig ?? Constants.expoConfig;
  if (config?.version) {
    detectedVersion = config.version;
  }
} catch {
  detectedVersion = "1.0.0";
}

export const CURRENT_APP_VERSION = detectedVersion;
export const CURRENT_BUILD_NUMBER = 1;

export interface AppUpdateInfo {
  latestVersionName: string;
  latestVersionCode: number;
  downloadUrl: string;
  releaseNotes?: string;
  isMandatory?: boolean;
  updatedAt?: string;
}

export function toEnglishDigits(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function cleanUrlString(url: string | null | undefined): string {
  if (!url) return "";
  return String(url)
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, "")
    .trim();
}

/**
 * Normalizes URL strings (removes hidden unicode marks, auto-adds https:// if protocol omitted).
 */
export function normalizeDownloadUrl(url: string | null | undefined): string {
  const cleaned = cleanUrlString(url);
  if (!cleaned) return "";
  if (!/^https?:\/\//i.test(cleaned)) {
    return `https://${cleaned}`;
  }
  return cleaned;
}

/**
 * Compare two semver strings like "1.0.0" and "1.1.0".
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const parseParts = (v: string) =>
    toEnglishDigits(String(v || ""))
      .replace(/^v/i, "")
      .trim()
      .split(".")
      .map((part) => {
        const num = parseInt(part, 10);
        return Number.isNaN(num) ? 0 : num;
      });

  const parts1 = parseParts(v1);
  const parts2 = parseParts(v2);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Validates whether a URL looks like an accessible web or direct download link.
 * Accepts links with or without explicit protocol (auto-normalizes).
 */
export function isValidDownloadUrl(url: string | null | undefined): boolean {
  const cleaned = cleanUrlString(url);
  if (!cleaned) return false;
  const normalized = normalizeDownloadUrl(cleaned);
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname || (!parsed.hostname.includes(".") && parsed.hostname !== "localhost")) {
      return false;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Determines whether an update is available for the current app version.
 * Returns true ONLY IF:
 *  1. downloadUrl is valid and not empty.
 *  2. latestVersionCode > current.versionCode OR latestVersionName > current.versionName (semver).
 */
export function isUpdateAvailable(
  current: { versionName: string; versionCode: number },
  latest: AppUpdateInfo | null | undefined
): boolean {
  if (!latest) return false;
  if (!isValidDownloadUrl(latest.downloadUrl)) return false;

  const currentCode = Number(current.versionCode) || 0;
  const latestCode = Number(latest.latestVersionCode) || 0;

  // If latest has a strictly higher version code, update is available
  if (latestCode > 0 && currentCode > 0) {
    if (latestCode > currentCode) return true;
    if (latestCode < currentCode) return false;
  }

  // Fallback to semantic version string comparison
  if (latest.latestVersionName && current.versionName) {
    return compareSemver(latest.latestVersionName, current.versionName) > 0;
  }

  return false;
}
