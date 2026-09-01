import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, uiStyles } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { saveCloudTeacherSession } from "@/lib/cloud-teacher-session";
import { hasConfiguredOfflineTeacherAccess, saveOfflineTeacherAccess, unlockOfflineTeacherAccess } from "@/lib/cloud-teacher-offline-access";
import { isTeacherInternetAvailable } from "@/lib/cloud-teacher-offline";
import { supabaseSchool } from "@/lib/supabase-school-api";

/** بوابة المعلم: تتيح إنشاء رمز سري أو تسجيل الدخول بالرمز مع دعم كامل للعمل دون اتصال */
export default function TeacherLoginScreen() {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [displayName, setDisplayName] = useState("المعلم");
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void hasConfiguredOfflineTeacherAccess().then((configured) => {
      if (!configured) {
        setIsCreatingPin(false);
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!pin.trim()) {
      setErrorMessage("يرجى إدخال الرمز السري");
      return;
    }
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
            // Check if teacher is not configured on cloud yet
            const status = (err as { status?: number }).status;
            const message = err instanceof Error ? err.message : "";
            if (status === 401 && (message.includes("غير صحيح") || message.includes("لم يتم"))) {
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
        }
      } else {
        const cachedToken = await unlockOfflineTeacherAccess(pin);
        if (!cachedToken) {
          throw new Error(
            "الرمز المدخل غير مطابق للرمز المحفوظ محلياً. إذا كانت هذه أول مرة، اضغط على 'إنشاء رمز سري للمعلم'."
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

  const handleCreatePin = async () => {
    if (pin.trim().length < 4) {
      setErrorMessage("الرمز السري يجب أن يتكون من 4 أرقام على الأقل");
      return;
    }
    if (pin.trim() !== confirmPin.trim()) {
      setErrorMessage("الرمز السري غير متطابق مع التأكيد");
      return;
    }

    setErrorMessage(null);
    setBusy(true);
    try {
      const trimmedPin = pin.trim();
      const online = await isTeacherInternetAvailable().catch(() => false);
      let sessionToken = "offline-teacher-session-" + Date.now();

      if (online) {
        try {
          const setupRes = await supabaseSchool.teacherSetup(trimmedPin, displayName.trim() || "المعلم");
          if (setupRes.teacher) {
            const loginRes = await supabaseSchool.teacherLogin(trimmedPin);
            sessionToken = loginRes.sessionToken;
          }
        } catch {
          // If setup failed because already configured, try logging in
          try {
            const loginRes = await supabaseSchool.teacherLogin(trimmedPin);
            sessionToken = loginRes.sessionToken;
          } catch {
            // Proceed with local offline setup so teacher is never blocked
          }
        }
      }

      await saveOfflineTeacherAccess(trimmedPin, sessionToken);
      await saveCloudTeacherSession(sessionToken);

      setPin("");
      setConfirmPin("");
      Alert.alert("تم بنجاح", "تم حفظ الرمز السري للمعلم بنجاح. يمكنك الدخول به دائماً سواء بإنترنت أو بدونه.");
      router.replace("/teacher/cloud");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء الرمز السري";
      setErrorMessage(message);
      Alert.alert("تنبيه", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gate}>
      <AppIcon name={isCreatingPin ? "key" : "lock"} color={colors.green} size={42} />
      <Text style={uiStyles.pageTitle}>{isCreatingPin ? "إنشاء رمز سري للمعلم" : "دخول المعلم"}</Text>
      <Text style={[uiStyles.pageSubtitle, styles.center]}>
        {isCreatingPin
          ? "عيّن رمزاً سرياً خاصاً بك كمعلم للوصول إلى بيانات طلابك وسجلاتهم في أي وقت."
          : "أدخل رمز المعلم للانتقال إلى قائمة الطلاب. يعمل الرمز محلياً في الحلقة دون إنترنت ومع السحابة."}
      </Text>

      {isCreatingPin && (
        <FormField
          label="اسم المعلم / المحفّظ (اختياري)"
          value={displayName}
          onChangeText={setDisplayName}
        />
      )}

      <FormField
        label={isCreatingPin ? "الرمز السري الجديد (4 أرقام على الأقل)" : "رمز المعلم"}
        value={pin}
        onChangeText={(value) => {
          setErrorMessage(null);
          setPin(value);
        }}
        secureTextEntry
        keyboardType="number-pad"
      />

      {isCreatingPin && (
        <FormField
          label="تأكيد الرمز السري"
          value={confirmPin}
          onChangeText={(value) => {
            setErrorMessage(null);
            setConfirmPin(value);
          }}
          secureTextEntry
          keyboardType="number-pad"
        />
      )}

      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}

      <PrimaryButton
        label={busy ? "جارٍ المعالجة…" : isCreatingPin ? "حفظ الرمز والدخول" : "دخول"}
        icon={isCreatingPin ? "check-circle" : "login"}
        disabled={busy || !pin.trim()}
        onPress={() => void (isCreatingPin ? handleCreatePin() : handleLogin())}
      />

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setErrorMessage(null);
            setIsCreatingPin((prev) => !prev);
          }}
          style={styles.modeToggleBtn}
        >
          <AppIcon name={isCreatingPin ? "login" : "add-circle-outline"} color={colors.green} size={17} />
          <Text style={styles.modeToggleText}>
            {isCreatingPin ? "لديك رمز بالفعل؟ تسجيل الدخول" : "إنشاء أو تعيين رمز سري جديد"}
          </Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.switchLink}>
        <AppIcon name="family-restroom" color={colors.gold} size={17} />
        <Text style={styles.switchText}>العودة إلى دخول ولي الأمر</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  gate: { alignItems: "center", backgroundColor: colors.paper, gap: 14, justifyContent: "center", padding: 24 },
  center: { textAlign: "center" },
  actionRow: { marginTop: 4, alignItems: "center" },
  modeToggleBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12 },
  modeToggleText: { color: colors.green, fontSize: 13, fontWeight: "800", writingDirection: "rtl" },
  switchLink: { alignItems: "center", flexDirection: "row-reverse", gap: 5, padding: 6, marginTop: 8 },
  switchText: { color: colors.gold, fontSize: 13, fontWeight: "900", textDecorationLine: "underline", writingDirection: "rtl" },
  error: { color: colors.rose, fontSize: 13, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
});
