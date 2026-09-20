import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import {
  CURRENT_APP_VERSION,
  CURRENT_BUILD_NUMBER,
  isUpdateAvailable,
  normalizeDownloadUrl,
  toEnglishDigits,
  type AppUpdateInfo,
} from "@/lib/app-version";

const CACHE_KEY = "quran-school-app-update-cache-v1";

function getBaseApiUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const origin =
    (Constants.expoConfig?.extra as { router?: { origin?: string } } | undefined)
      ?.router?.origin ??
    process.env.EXPO_PUBLIC_API_URL ??
    "https://ais-dev-fdklvezuzjjezb2ytxwyw3-365228383875.europe-west3.run.app";
  return origin.replace(/\/+$/, "");
}

/**
 * Fetch the latest app update configuration from the server.
 */
export async function fetchRemoteAppUpdate(): Promise<AppUpdateInfo | null> {
  const baseUrl = getBaseApiUrl();
  const url = `${baseUrl}/api/app-update`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return getCachedAppUpdate();
    }

    const data = (await response.json()) as { success: boolean; update?: AppUpdateInfo };
    if (data.success && data.update) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data.update));
      return data.update;
    }
  } catch {
    // Network or server unreachable, fallback to local cache
  }

  return getCachedAppUpdate();
}

/**
 * Read the cached update info from local storage.
 */
export async function getCachedAppUpdate(): Promise<AppUpdateInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUpdateInfo;
  } catch {
    return null;
  }
}

/**
 * Check if a newer version is available for this installed app.
 * Returns hasUpdate: true ONLY IF the current app is outdated compared to the remote release.
 */
export async function checkForAppUpdate(): Promise<{
  hasUpdate: boolean;
  update: AppUpdateInfo | null;
  currentVersion: string;
  currentBuild: number;
}> {
  const current = {
    versionName: CURRENT_APP_VERSION,
    versionCode: CURRENT_BUILD_NUMBER,
  };

  const remote = await fetchRemoteAppUpdate();
  const hasUpdate = isUpdateAvailable(current, remote);

  return {
    hasUpdate,
    update: hasUpdate ? remote : null,
    currentVersion: current.versionName,
    currentBuild: current.versionCode,
  };
}

/**
 * Teacher action to publish or update the direct release link.
 */
export async function publishAppUpdate(
  updateData: Omit<AppUpdateInfo, "updatedAt">
): Promise<AppUpdateInfo> {
  const baseUrl = getBaseApiUrl();
  const url = `${baseUrl}/api/app-update`;

  const normalizedUrl = updateData.downloadUrl?.trim()
    ? normalizeDownloadUrl(updateData.downloadUrl.trim())
    : "";

  const parsedVersionCode =
    parseInt(toEnglishDigits(String(updateData.latestVersionCode)), 10) || 1;
  const parsedVersionName =
    toEnglishDigits(updateData.latestVersionName)?.trim() || "1.0.0";

  const payload: AppUpdateInfo = {
    latestVersionName: parsedVersionName,
    latestVersionCode: parsedVersionCode,
    downloadUrl: normalizedUrl,
    releaseNotes: updateData.releaseNotes?.trim() ?? "",
    isMandatory: Boolean(updateData.isMandatory),
    updatedAt: new Date().toISOString(),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = (await response.json()) as { success: boolean; update?: AppUpdateInfo };
      if (result.success && result.update) {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result.update));
        return result.update;
      }
    }
  } catch {
    // If offline, save locally
  }

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
}
