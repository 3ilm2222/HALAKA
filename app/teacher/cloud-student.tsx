import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Network from "expo-network";
import { router, useLocalSearchParams } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, SecondaryButton, Surface, uiStyles } from "@/components/app-ui";
import { BoardCanvas } from "@/components/board-canvas";
import { ScreenContainer } from "@/components/screen-container";
import { loadCloudTeacherSession } from "@/lib/cloud-teacher-session";
import { cacheBoardRecord, cacheStudent, cacheTeacherDetail, cacheTeacherMessage, createOfflineId, enqueueTeacherMutation, flushTeacherOfflineQueue, isTeacherInternetAvailable, loadCachedTeacherDetail, loadTeacherOfflineCache, removeCachedTeacherStudent } from "@/lib/cloud-teacher-offline";
import { type BoardElement } from "@/lib/app-types";
import { currentMonthKey, monthLabel } from "@/lib/months";
import { supabaseSchool, type ParentNotificationStatus, type SchoolAttendance, type SchoolBoard, type SchoolMessage, type SchoolStudent } from "@/lib/supabase-school-api";

type TeacherDetail = { student: SchoolStudent; boards: SchoolBoard[]; attendance: SchoolAttendance[]; messages: SchoolMessage[]; parentNotification?: ParentNotificationStatus };

export default function CloudStudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [student, setStudent] = useState<SchoolStudent | null>(null);
  const [boards, setBoards] = useState<SchoolBoard[]>([]);
  const [attendance, setAttendance] = useState<SchoolAttendance[]>([]);
  const [messages, setMessages] = useState<SchoolMessage[]>([]);
  const [parentNotification, setParentNotification] = useState<ParentNotificationStatus | null>(null);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(currentMonthKey());
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [canvasHeight, setCanvasHeight] = useState(560);
  const [themeKey, setThemeKey] = useState("classic");
  const [theme, setTheme] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editParentPin, setEditParentPin] = useState("");
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState("جارٍ فتح البيانات المحلية…");
  const snapshotRef = useRef({ month, elements, canvasHeight, themeKey, theme });
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const syncingRef = useRef(false);
  const queuedWeekRemindersRef = useRef(new Set<string>());
  const active = useMemo(() => boards.find((entry) => entry.month_key === month), [boards, month]);
  const boardAttendance = useMemo(() => attendance.map((entry) => ({ dateKey: entry.date_key, morningAbsent: entry.morning_absent, eveningAbsent: entry.evening_absent })), [attendance]);

  const updatePendingCount = useCallback(async () => {
    const cache = await loadTeacherOfflineCache();
    setPendingCount(cache.queue.length);
    return cache.queue.length;
  }, []);

  const applyDetail = useCallback((detail: TeacherDetail, source: "local" | "cloud") => {
    setStudent(detail.student);
    setBoards(detail.boards);
    setAttendance(detail.attendance);
    setMessages(detail.messages);
    setParentNotification(detail.parentNotification ?? null);
    void cacheTeacherDetail(detail);
    if (source === "local") setStatus("تعمل السبورة من النسخة المحفوظة على الجهاز");
  }, []);

  const syncPending = useCallback(async (session = token) => {
    if (!session || syncingRef.current) return false;
    const reachable = await isTeacherInternetAvailable().catch(() => false);
    setOnline(reachable);
    if (!reachable) {
      const count = await updatePendingCount();
      setStatus(count ? `محفوظ محلياً · ${count} تعديل بانتظار الإنترنت` : "وضع دون اتصال · لا توجد تعديلات معلقة");
      return false;
    }
    syncingRef.current = true;
    try {
      const completed = await flushTeacherOfflineQueue(session);
      const count = await updatePendingCount();
      setStatus(completed ? `تمت مزامنة ${completed} تعديل` : count ? `${count} تعديل بانتظار المزامنة` : "كل التغييرات محفوظة محلياً وسحابياً");
      return count === 0;
    } catch {
      const count = await updatePendingCount();
      setOnline(false);
      setStatus(`محفوظ محلياً · ${count} تعديل بانتظار الإنترنت`);
      return false;
    } finally {
      syncingRef.current = false;
    }
  }, [token, updatePendingCount]);

  const loadDetail = useCallback(async (session: string) => {
    if (!id) return false;
    const cached = await loadCachedTeacherDetail(id);
    if (cached) applyDetail(cached, "local");
    const reachable = await isTeacherInternetAvailable().catch(() => false);
    setOnline(reachable);
    if (!reachable) {
      await updatePendingCount();
      return Boolean(cached);
    }
    try {
      await syncPending(session);
      const detail = await supabaseSchool.teacherDetail(session, id);
      applyDetail(detail, "cloud");
      setStatus("كل التغييرات محفوظة محلياً وسحابياً");
      return true;
    } catch {
      setOnline(false);
      return Boolean(cached);
    }
  }, [applyDetail, id, syncPending, updatePendingCount]);

  useEffect(() => {
    let mounted = true;
    void loadCloudTeacherSession().then(async (session) => {
      if (!session) { router.replace("/teacher/cloud"); return; }
      setToken(session);
      const found = await loadDetail(session);
      if (!mounted) return;
      setLoading(false);
      if (!found) setStatus("لا توجد نسخة محلية لهذا الطالب. اتصل بالإنترنت مرة واحدة لفتحه.");
    });
    return () => { mounted = false; };
  }, [loadDetail]);

  useEffect(() => {
    const listener = Network.addNetworkStateListener((state) => {
      const reachable = state.isInternetReachable !== false;
      setOnline(reachable);
      if (reachable && token) void (async () => { const synced = await syncPending(token); if (synced) await loadDetail(token); })();
    });
    return () => listener.remove();
  }, [loadDetail, syncPending, token]);

  useEffect(() => {
    const nextElements = (active?.elements ?? []) as BoardElement[];
    const nextHeight = active?.canvas_height ?? 560;
    const nextThemeKey = active?.theme_key ?? "classic";
    const nextTheme = active?.theme ?? null;
    snapshotRef.current = { month, elements: nextElements, canvasHeight: nextHeight, themeKey: nextThemeKey, theme: nextTheme };
    nextElements.filter((element) => element.type === "weekRow").forEach((element) => queuedWeekRemindersRef.current.add(element.id));
    dirtyRef.current = false;
    setElements(nextElements); setCanvasHeight(nextHeight); setThemeKey(nextThemeKey); setTheme(nextTheme);
  }, [active, month]);

  const save = useCallback(async () => {
    if (!id || saving) return;
    const revision = revisionRef.current;
    const snapshot = snapshotRef.current;
    const localBoard: SchoolBoard = {
      id: active?.id ?? `local-${id}-${snapshot.month}`,
      student_id: id,
      month_key: snapshot.month,
      label: monthLabel(snapshot.month),
      elements: snapshot.elements,
      canvas_height: snapshot.canvasHeight,
      theme_key: snapshot.themeKey,
      theme: snapshot.theme,
    };
    setSaving(true);
    try {
      const newWeekRows = snapshot.elements.filter((element) => element.type === "weekRow" && !queuedWeekRemindersRef.current.has(element.id));
      newWeekRows.forEach((element) => queuedWeekRemindersRef.current.add(element.id));
      await cacheBoardRecord(localBoard);
      setBoards((current) => [...current.filter((entry) => entry.month_key !== localBoard.month_key), localBoard]);
      await enqueueTeacherMutation({ type: "saveBoard", studentId: id, board: { monthKey: localBoard.month_key, label: localBoard.label, elements: localBoard.elements, canvasHeight: localBoard.canvas_height, themeKey: localBoard.theme_key, theme: localBoard.theme } });
      for (const weekRow of newWeekRows) await enqueueTeacherMutation({ type: "sendWeekReminder", studentId: id, monthKey: localBoard.month_key, weekNumber: weekRow.weekNumber ?? 1, clientReminderId: createOfflineId() });
      await updatePendingCount();
      if (revisionRef.current === revision) dirtyRef.current = false;
      setStatus("تم الحفظ على الجهاز");
      await syncPending();
    } catch (error) {
      setStatus("تعذر الحفظ المحلي");
      Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "حاول مجدداً");
    } finally {
      setSaving(false);
    }
  }, [active?.id, id, saving, syncPending, updatePendingCount]);

  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => () => { if (dirtyRef.current) void saveRef.current(); }, []);
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => { void save(); }, 700);
    return () => clearTimeout(timer);
  }, [elements, canvasHeight, save, theme, themeKey]);

  const changed = () => { dirtyRef.current = true; revisionRef.current += 1; setStatus("تغييرات غير محفوظة"); };
  const leaveStudent = async () => { if (dirtyRef.current) await save(); router.back(); };

  const sendMessage = async () => {
    if (!id || !message.trim()) return;
    const clientMessageId = createOfflineId();
    const localMessage: SchoolMessage = { id: clientMessageId, student_id: id, sender_role: "teacher", content: message.trim(), is_note: false, created_at: new Date().toISOString(), read_at: null };
    try {
      setMessages((current) => [...current, localMessage]);
      await cacheTeacherMessage(localMessage);
      await enqueueTeacherMutation({ type: "sendMessage", studentId: id, content: localMessage.content, isNote: false, clientMessageId });
      setMessage("");
      await updatePendingCount();
      setStatus("تم حفظ الرسالة على الجهاز");
      await syncPending();
    } catch (error) {
      Alert.alert("تعذر حفظ الرسالة محلياً", error instanceof Error ? error.message : "حاول مجدداً");
    }
  };

  const openSettings = () => {
    if (!student) return;
    setEditName(student.name); setEditAge(String(student.age)); setEditParentPin(""); setSettingsVisible(true);
  };

  const saveStudentSettings = async () => {
    if (!student) return;
    const parsedAge = Number(editAge);
    if (!editName.trim() || !Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) return Alert.alert("تحقق من البيانات", "اكتب اسم الطالب وعمره بصورة صحيحة.");
    if (editParentPin && editParentPin.length < 4) return Alert.alert("رمز ولي الأمر", "اكتب رمزاً من أربعة أحرف أو أرقام على الأقل.");
    const updated = { ...student, name: editName.trim(), normalized_name: editName.trim(), age: parsedAge, updated_at: new Date().toISOString() };
    setSettingsBusy(true);
    try {
      setStudent(updated);
      await cacheStudent(updated);
      await enqueueTeacherMutation({ type: "upsertStudent", student: { id: updated.id, ...(updated.teacher_id === "local" ? { clientId: updated.id } : {}), name: updated.name, age: updated.age, ...(editParentPin ? { parentPin: editParentPin } : {}) } });
      setSettingsVisible(false); setEditParentPin("");
      await updatePendingCount();
      setStatus("تم حفظ إعدادات الطالب على الجهاز");
      await syncPending();
    } catch (error) {
      Alert.alert("تعذر الحفظ المحلي", error instanceof Error ? error.message : "حاول مجدداً");
    } finally {
      setSettingsBusy(false);
    }
  };

  const deleteStudent = () => {
    if (!student) return;
    Alert.alert("حذف الطالب نهائياً", `سيُحذف ${student.name} مع سبوراته وغيابه ورسائله عند المزامنة.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف نهائياً", style: "destructive", onPress: () => void (async () => {
        setSettingsBusy(true);
        try {
          await removeCachedTeacherStudent(student.id);
          await enqueueTeacherMutation({ type: "deleteStudent", studentId: student.id });
          await updatePendingCount();
          await syncPending();
          setSettingsVisible(false);
          router.replace("/teacher/cloud");
        } catch (error) {
          Alert.alert("تعذر حفظ الحذف محلياً", error instanceof Error ? error.message : "حاول مجدداً");
        } finally { setSettingsBusy(false); }
      })() },
    ]);
  };

  if (loading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ فتح ملف الطالب من الجهاز…</Text></ScreenContainer>;
  if (!student) return <ScreenContainer style={styles.noData}><AppIcon name="cloud-off" color={colors.rose} size={36} /><Text style={uiStyles.pageTitle}>لا توجد نسخة محلية</Text><Text style={uiStyles.pageSubtitle}>{status}</Text><SecondaryButton label="العودة للقائمة" onPress={() => router.back()} /></ScreenContainer>;

  const notificationEnabled = parentNotification?.enabled ?? false;
  const reminderStatus = parentNotification?.sentAt ? `آخر تذكير تم إرساله: ${new Date(parentNotification.sentAt).toLocaleDateString("ar")}` : "لم يُرسل تذكير أسبوعي بعد.";
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.header}><Pressable onPress={() => void leaveStudent()} style={styles.icon}><AppIcon name="arrow-forward" /></Pressable><View style={styles.headerTitle}><Text style={uiStyles.pageTitle}>{student.name}</Text><Text style={uiStyles.pageSubtitle}>{online ? "سبورة محفوظة محلياً وسحابياً" : "سبورة تعمل دون اتصال"}</Text></View><Pressable accessibilityLabel="إعدادات الطالب" onPress={openSettings} style={styles.icon}><AppIcon name="settings" /></Pressable></View><Surface style={online ? styles.syncCard : { ...styles.syncCard, ...styles.syncCardOffline }}><AppIcon name={online ? "cloud-done" : "cloud-off"} color={online ? colors.green : colors.rose} size={18} /><View style={styles.syncCopy}><Text style={styles.syncTitle}>{online ? "متصل" : "دون اتصال"}</Text><Text style={styles.syncText}>{status}</Text></View>{pendingCount > 0 ? <Text style={styles.pending}>{pendingCount}</Text> : null}</Surface><Surface style={notificationEnabled ? styles.notificationReady : styles.notificationMissing}><AppIcon name={notificationEnabled ? "notifications-active" : "notifications-off"} color={notificationEnabled ? colors.green : colors.rose} size={22} /><View style={styles.notificationCopy}><Text style={styles.notificationTitle}>{notificationEnabled ? "إشعارات ولي الأمر مفعّلة" : "ولي الأمر لم يفعّل الإشعارات"}</Text><Text style={styles.notificationText}>{notificationEnabled ? `${parentNotification?.deviceCount ?? 0} جهاز مسجّل للتنبيهات. ${reminderStatus}` : "لن يصل تذكير الأسبوع إلى الهاتف حتى يفتح ولي الأمر التطبيق ويوافق على الإشعارات."}</Text></View></Surface><Surface style={styles.months}>{[...boards].map((entry) => <Pressable key={entry.month_key} style={[styles.month, month === entry.month_key && styles.monthActive]} onPress={() => setMonth(entry.month_key)}><Text style={[styles.monthText, month === entry.month_key && styles.monthTextActive]}>{entry.label}</Text></Pressable>)}<Pressable style={styles.month} onPress={() => setMonth(currentMonthKey())}><Text style={styles.monthText}>الشهر الحالي</Text></Pressable></Surface><BoardCanvas key={`${month}:${active?.id ?? "new"}`} boardKey={month} initialElements={(active?.elements ?? elements) as BoardElement[]} initialCanvasHeight={active?.canvas_height ?? canvasHeight} initialThemeKey={active?.theme_key ?? themeKey} initialThemeColors={(active?.theme ?? theme) as never} attendanceRecords={boardAttendance} editable onElementsChange={(next) => { snapshotRef.current = { ...snapshotRef.current, elements: next }; setElements(next); changed(); }} onCanvasHeightChange={(next) => { snapshotRef.current = { ...snapshotRef.current, canvasHeight: next }; setCanvasHeight(next); changed(); }} onThemeChange={(next) => { snapshotRef.current = { ...snapshotRef.current, themeKey: next }; setThemeKey(next); changed(); }} onThemeColorsChange={(next) => { snapshotRef.current = { ...snapshotRef.current, theme: next }; setTheme(next); changed(); }} /><PrimaryButton label={saving ? "جارٍ الحفظ…" : "حفظ الآن على الجهاز"} icon="save" disabled={saving} onPress={save} /><Surface style={styles.messages}><Text style={styles.messageTitle}>مراسلة ولي الأمر</Text><Text style={uiStyles.pageSubtitle}>تُحفظ الرسالة محلياً ثم تصل إليه بعد عودة الإنترنت والمزامنة.</Text>{messages.slice(-4).map((entry) => <Text key={entry.id} style={styles.messageText}>{entry.sender_role === "teacher" ? "المعلم: " : "ولي الأمر: "}{entry.content}</Text>)}<TextInput value={message} onChangeText={setMessage} placeholder="اكتب رسالة أو ملاحظة…" placeholderTextColor={colors.muted} textAlign="right" style={styles.input} /><PrimaryButton label="حفظ وإرسال الرسالة" icon="send" disabled={!message.trim()} onPress={sendMessage} /></Surface><SecondaryButton label="العودة للقائمة" onPress={() => void leaveStudent()} /></ScrollView><Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.sheetHead}><Text style={uiStyles.pageTitle}>إعدادات الطالب</Text><Pressable onPress={() => setSettingsVisible(false)} style={styles.close}><AppIcon name="close" /></Pressable></View><FormField label="اسم الطالب" value={editName} onChangeText={setEditName} /><FormField label="العمر" value={editAge} onChangeText={setEditAge} keyboardType="number-pad" /><FormField label="رمز جديد لولي الأمر (اختياري)" value={editParentPin} onChangeText={setEditParentPin} secureTextEntry placeholder="اتركه فارغاً لإبقاء الرمز الحالي" /><PrimaryButton label={settingsBusy ? "جارٍ الحفظ…" : "حفظ التعديلات"} icon="save" disabled={settingsBusy} onPress={() => void saveStudentSettings()} /><SecondaryButton label="حذف الطالب نهائياً" icon="delete-outline" danger onPress={deleteStudent} /><SecondaryButton label="إلغاء" onPress={() => setSettingsVisible(false)} /></View></View></Modal></ScreenContainer>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.paper }, noData: { alignItems: "center", backgroundColor: colors.paper, gap: 14, justifyContent: "center", padding: 24 }, content: { gap: 14, padding: 14, paddingBottom: 32 }, header: { alignItems: "center", flexDirection: "row-reverse", gap: 10, justifyContent: "space-between" }, headerTitle: { flex: 1 }, icon: { alignItems: "center", backgroundColor: colors.white, borderRadius: 12, height: 44, justifyContent: "center", width: 44 }, syncCard: { alignItems: "center", backgroundColor: colors.paleGreen, flexDirection: "row-reverse", gap: 9, padding: 12 }, syncCardOffline: { backgroundColor: "#FFF1F0" }, syncCopy: { flex: 1 }, syncTitle: { color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, syncText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "right", writingDirection: "rtl" }, pending: { alignItems: "center", backgroundColor: colors.rose, borderRadius: 12, color: colors.white, fontSize: 11, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3 }, notificationReady: { alignItems: "center", backgroundColor: "#EDF8F2", borderColor: "#B7DDC8", borderWidth: 1, flexDirection: "row-reverse", gap: 10, padding: 12 }, notificationMissing: { alignItems: "center", backgroundColor: "#FFF1F0", borderColor: "#F2C5C5", borderWidth: 1, flexDirection: "row-reverse", gap: 10, padding: 12 }, notificationCopy: { flex: 1, gap: 2 }, notificationTitle: { color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, notificationText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "right", writingDirection: "rtl" }, months: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, padding: 10 }, month: { backgroundColor: colors.paleGreen, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, monthActive: { backgroundColor: colors.green }, monthText: { color: colors.green, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, monthTextActive: { color: colors.white }, messages: { gap: 9, padding: 13 }, messageTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, messageText: { color: colors.ink, textAlign: "right", writingDirection: "rtl" }, input: { borderColor: colors.line, borderRadius: 10, borderWidth: 1, color: colors.ink, minHeight: 62, padding: 9, writingDirection: "rtl" }, overlay: { backgroundColor: "rgba(0,0,0,.42)", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 13, padding: 22, paddingBottom: 32 }, sheetHead: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, close: { backgroundColor: colors.white, borderRadius: 12, padding: 8 },
});
