import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { colors, FormField, PrimaryButton, SecondaryButton, uiStyles } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadParentSession, saveParentSession } from "@/lib/parent-session";
import { trpc } from "@/lib/trpc";

export default function ParentLoginScreen() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const login = trpc.parent.login.useMutation();
  useEffect(() => { loadParentSession().then((session) => { if (session) router.replace("/parent-board"); setCheckingSession(false); }); }, []);
  const submit = async () => { if (!name.trim() || !pin.trim()) { Alert.alert("أدخل البيانات", "اكتب اسم الطالب والرمز السري المخصص لولي الأمر."); return; } try { const result = await login.mutateAsync({ name, pin }); await saveParentSession({ token: result.token, studentId: result.student.id, studentName: result.student.name }); router.replace("/parent-board"); } catch (error) { Alert.alert("تعذر الدخول", error instanceof Error ? error.message : "تحقق من البيانات وحاول مجدداً."); } };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.container}><View style={styles.top}><Image source={require("@/assets/images/icon.png")} style={styles.logo} /><Text style={styles.eyebrow}>بوابة ولي الأمر</Text><Text style={uiStyles.pageTitle}>متابعة سجل الطالب</Text><Text style={[uiStyles.pageSubtitle, styles.center]}>أدخل اسم الطالب والرمز الذي أنشأه المعلم. سيُحفظ الدخول على هاتفك.</Text></View><View style={styles.form}><FormField label="اسم الطالب" value={name} onChangeText={setName} placeholder="اكتب الاسم كما سجله المعلم" autoCapitalize="words" /><FormField label="الرمز السري" value={pin} onChangeText={setPin} placeholder="رمز ولي الأمر" secureTextEntry /><PrimaryButton label={login.isPending || checkingSession ? "جارٍ التحقق…" : "دخول إلى سجل الطالب"} icon="login" disabled={login.isPending || checkingSession} onPress={submit} /><SecondaryButton label="العودة للبداية" icon="arrow-forward" onPress={() => router.replace("/")} /></View></ScreenContainer>;
}

const styles = StyleSheet.create({ container: { backgroundColor: colors.paper, justifyContent: "space-between", padding: 25 }, top: { alignItems: "center", gap: 8, marginTop: 38 }, logo: { borderRadius: 23, height: 92, width: 92 }, eyebrow: { color: colors.gold, fontSize: 14, fontWeight: "800", writingDirection: "rtl" }, center: { textAlign: "center" }, form: { gap: 15, marginBottom: 32 } });
