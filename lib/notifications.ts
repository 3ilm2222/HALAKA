import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function prepareNotifications() {
  if (Platform.OS === "web") return null;
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
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
