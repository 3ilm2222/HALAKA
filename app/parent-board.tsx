import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppIcon, colors, PrimaryButton, Surface, uiStyles } from "@/components/app-ui";
import { BoardCanvas } from "@/components/board-canvas";
import { ScreenContainer } from "@/components/screen-container";
import { type BoardElement } from "@/lib/app-types";
import { monthLabel } from "@/lib/months";
import { clearParentSession, loadParentSession, type ParentSession } from "@/lib/parent-session";
import { prepareNotifications } from "@/lib/notifications";
import { trpc } from "@/lib/trpc";

export default function ParentBoardScreen() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const [session, setSession] = useState<ParentSession | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { loadParentSession().then((saved) => { if (!saved) router.replace("/parent-login"); else setSession(saved); }); }, []);
  const dashboard = trpc.parent.dashboard.useQuery({ token: session?.token ?? "" }, { enabled: Boolean(session?.token) });
  const sendMessage = trpc.parent.sendMessage.useMutation({ onSuccess: () => { setMessage(""); dashboard.refetch(); } });
  const registerPush = trpc.parent.registerPushToken.useMutation();
  const parentLogout = trpc.parent.logout.useMutation();
  useEffect(() => { if (!session?.token) return; prepareNotifications().then((pushToken) => { if (pushToken) registerPush.mutate({ token: session.token, pushToken }); }); }, [session?.token, registerPush]);
  useEffect(() => { if (params.studentId && dashboard.data?.student.id === Number(params.studentId)) setSelectedMonth(null); }, [params.studentId, dashboard.data?.student.id]);
  const boards = useMemo(() => dashboard.data?.boards ?? [], [dashboard.data?.boards]);
  const activeMonth = selectedMonth ?? boards[0]?.monthKey ?? null;
  const activeBoard = useMemo(() => boards.find((board) => board.monthKey === activeMonth), [boards, activeMonth]);
  const submitMessage = async () => { if (!session?.token || !message.trim()) return; try { await sendMessage.mutateAsync({ token: session.token, content: message }); } catch (error) { Alert.alert("تعذر الإرسال", error instanceof Error ? error.message : "حاول مجدداً."); } };
  const logout = () => Alert.alert("تسجيل الخروج", "هل تريد إزالة دخول ولي الأمر من هذا الهاتف؟", [{ text: "إلغاء", style: "cancel" }, { text: "خروج", style: "destructive", onPress: async () => { try { if (session?.token) await parentLogout.mutateAsync({ token: session.token }); } finally { await clearParentSession(); router.replace("/"); } } }]);
  if (!session || dashboard.isLoading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ فتح سجل الطالب…</Text></ScreenContainer>;
  if (dashboard.error || !dashboard.data) return <ScreenContainer className="items-center justify-center gap-4 p-5"><Text style={[uiStyles.pageSubtitle, { textAlign: "center" }]}>انتهت الجلسة أو تعذر فتح الملف.</Text><PrimaryButton label="تسجيل الدخول مجدداً" onPress={async () => { await clearParentSession(); router.replace("/parent-login"); }} /></ScreenContainer>;
  const student = dashboard.data.student;
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.container}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.topRow}><View><Text style={styles.eyebrow}>سجل الطالب</Text><Text style={uiStyles.pageTitle}>{student.name}</Text><Text style={uiStyles.pageSubtitle}>{student.age} سنة · عرض ولي الأمر</Text></View><Pressable onPress={logout} style={styles.logout}><AppIcon name="logout" color={colors.rose} /></Pressable></View>
    <View style={styles.viewOnly}><AppIcon name="visibility" color={colors.green} size={18} /><Text style={styles.viewOnlyText}>وضع العرض فقط — لا يمكن تعديل السبورة</Text></View>
    <Text style={styles.sectionTitle}>الأشهر</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>{boards.map((board) => <Pressable key={board.id} onPress={() => setSelectedMonth(board.monthKey)} style={[styles.monthChip, activeMonth === board.monthKey && styles.monthChipSelected]}><Text style={[styles.monthChipText, activeMonth === board.monthKey && styles.monthChipTextSelected]}>{board.label}</Text></Pressable>)}</ScrollView>
    <Text style={styles.boardCaption}>{activeBoard?.label ?? (activeMonth ? monthLabel(activeMonth) : "لا يوجد سجل شهري بعد")}</Text><BoardCanvas boardKey={activeMonth ?? "none"} initialElements={(activeBoard?.elements ?? []) as BoardElement[]} initialCanvasHeight={activeBoard?.canvasHeight ?? 560} initialThemeKey={activeBoard?.themeKey ?? "classic"} initialThemeColors={activeBoard?.themeColors ?? null} attendanceRecords={dashboard.data.attendance} editable={false} />
    <Surface style={styles.messagesCard}><Text style={styles.sectionTitle}>مراسلة المعلم</Text>{dashboard.data.messages.slice(-5).reverse().map((item) => <View key={item.id} style={[styles.message, item.senderRole === "parent" ? styles.myMessage : styles.teacherMessage]}><Text style={styles.messageRole}>{item.senderRole === "parent" ? "أنت" : "المعلم"}{item.isNote ? " · ملاحظة" : ""}</Text><Text style={styles.messageText}>{item.content}</Text></View>)}<TextInput multiline value={message} onChangeText={setMessage} placeholder="اكتب رسالة للمعلم…" placeholderTextColor="#93A19A" style={styles.messageInput} textAlign="right" /><PrimaryButton label={sendMessage.isPending ? "جارٍ الإرسال…" : "إرسال للمعلم"} icon="send" disabled={!message.trim() || sendMessage.isPending} onPress={submitMessage} /></Surface>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ container: { backgroundColor: colors.paper }, content: { gap: 15, padding: 16, paddingBottom: 30 }, topRow: { alignItems: "flex-start", flexDirection: "row-reverse", justifyContent: "space-between" }, eyebrow: { color: colors.gold, fontSize: 13, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, logout: { alignItems: "center", backgroundColor: "#F9E9E9", borderRadius: 13, height: 44, justifyContent: "center", width: 44 }, viewOnly: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 14, flexDirection: "row-reverse", gap: 7, padding: 12 }, viewOnlyText: { color: colors.green, flex: 1, fontSize: 13, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, months: { flexDirection: "row", gap: 8 }, monthChip: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 }, monthChipSelected: { backgroundColor: colors.green, borderColor: colors.green }, monthChipText: { color: colors.green, fontSize: 13, fontWeight: "800", writingDirection: "rtl" }, monthChipTextSelected: { color: colors.white }, boardCaption: { color: colors.muted, fontSize: 14, textAlign: "right", writingDirection: "rtl" }, messagesCard: { gap: 11 }, message: { borderRadius: 13, gap: 4, padding: 11 }, myMessage: { backgroundColor: colors.paleGold }, teacherMessage: { backgroundColor: colors.paleGreen }, messageRole: { color: colors.green, fontSize: 11, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, messageText: { color: colors.ink, fontSize: 14, lineHeight: 20, textAlign: "right", writingDirection: "rtl" }, messageInput: { borderColor: colors.line, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 80, padding: 11, writingDirection: "rtl" } });
