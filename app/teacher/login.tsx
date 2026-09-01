import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, uiStyles } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { saveCloudTeacherSession } from "@/lib/cloud-teacher-session";
import { saveOfflineTeacherAccess, unlockOfflineTeacherAccess } from "@/lib/cloud-teacher-offline-access";
import { isTeacherInternetAvailable } from "@/lib/cloud-teacher-offline";
import { supabaseSchool } from "@/lib/supabase-school-api";

/** بوابة مستقلة لا تفتح قائمة المعلم قبل التحقق من الرمز. */
export default function TeacherLoginScreen() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const login = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const online = await isTeacherInternetAvailable().catch(() => false);
      let loggedIn = false;

      if (online) {
        try {
          const result = await supabaseSchool.teacherLogin(pin);
          await saveCloudTeacherSession(result.sessionToken);
          await saveOfflineTeacherAccess(pin, result.sessionToken);
          loggedIn = true;
        } catch (err) {
          const isNetworkError =
            err instanceof Error &&
            (err.message.includes("تعذر الاتصال") ||
              err.message.includes("مهلة") ||
              err.message.includes("Failed to fetch") ||
              err.message.includes("Network"));
          if (isNetworkError) {
            const cachedToken = await unlockOfflineTeacherAccess(pin);
            if (cachedToken) {
              await saveCloudTeacherSession(cachedToken);
              loggedIn = true;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      } else {
        const cachedToken = await unlockOfflineTeacherAccess(pin);
        if (!cachedToken) {
          throw new Error(
            "لا توجد بيانات دخول محلية مطابقة. اتصل بالإنترنت مرة واحدة وسجّل الدخول بهذا الرمز أولاً."
          );
        }
        await saveCloudTeacherSession(cachedToken);
        loggedIn = true;
      }

      if (loggedIn) {
        setPin("");
        router.replace("/teacher/cloud");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "تحقق من الرمز ثم حاول مجدداً.";
      setErrorMessage(message);
      Alert.alert("تعذر الدخول", message);
    } finally {
      setBusy(false);
    }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gate}>
    <AppIcon name="lock" color={colors.green} size={42} />
    <Text style={uiStyles.pageTitle}>دخول المعلم</Text>
    <Text style={[uiStyles.pageSubtitle, styles.center]}>أدخل رمز المعلم للانتقال إلى قائمة الطلاب. بعد أول دخول متصل، يعمل الرمز نفسه محلياً في الحلقة دون إنترنت.</Text>
    <FormField label="رمز المعلم" value={pin} onChangeText={(value) => { setErrorMessage(null); setPin(value); }} secureTextEntry />
    {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
    <PrimaryButton label={busy ? "جارٍ التحقق…" : "دخول"} icon="login" disabled={busy || !pin.trim()} onPress={() => void login()} />
    <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.switchLink}><AppIcon name="family-restroom" color={colors.gold} size={17} /><Text style={styles.switchText}>العودة إلى دخول ولي الأمر</Text></Pressable>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  gate: { alignItems: "center", backgroundColor: colors.paper, gap: 16, justifyContent: "center", padding: 24 },
  center: { textAlign: "center" },
  switchLink: { alignItems: "center", flexDirection: "row-reverse", gap: 5, padding: 6 },
  switchText: { color: colors.gold, fontSize: 13, fontWeight: "900", textDecorationLine: "underline", writingDirection: "rtl" },
  error: { color: colors.rose, fontSize: 13, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
});
