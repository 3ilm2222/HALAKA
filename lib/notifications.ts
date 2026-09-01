import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let notificationHandlerConfigured = false;

function ensureNotificationHandler() {
  if (notificationHandlerConfigured || Platform.OS === "web") return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  } catch {
    // Ignore notification handler setup error on startup
  }
}

export async function prepareNotifications() {
  if (Platform.OS === "web") return null;
  ensureNotificationHandler();
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("teacher-notes", {
        name: "ملاحظات المعلم",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 100, 180],
        lightColor: "#176B53",
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    const status = permission.status === "granted" ? permission.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;

    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

