type PushPayload = {
  token: string;
  title: string;
  body: string;
  studentId: number;
};

/** Sends best-effort mobile alerts. The message is already stored in the database if delivery fails. */
export async function sendParentPushNotifications(payloads: PushPayload[]) {
  const messages = payloads
    .filter((payload) => payload.token.startsWith("ExponentPushToken[") || payload.token.startsWith("ExpoPushToken["))
    .map((payload) => ({
      to: payload.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: { url: `/parent-board?studentId=${payload.studentId}` },
      channelId: "teacher-notes",
    }));

  if (messages.length === 0) return { attempted: 0, delivered: false };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    return { attempted: messages.length, delivered: response.ok };
  } catch {
    return { attempted: messages.length, delivered: false };
  }
}
