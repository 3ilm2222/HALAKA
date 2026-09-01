import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, SecondaryButton, Surface, uiStyles } from "@/components/app-ui";
import { BoardCanvas } from "@/components/board-canvas";
import { attendanceDateLabel } from "@/lib/attendance";
import { ScreenContainer } from "@/components/screen-container";
import { type BoardElement } from "@/lib/app-types";
import { type CustomThemeColors } from "@/lib/board-themes";
import { currentMonthKey, monthLabel, nextMonthKey } from "@/lib/months";
import { trpc } from "@/lib/trpc";

export default function TeacherStudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const studentId = Number(id);
  const detail = trpc.students.detail.useQuery({ id: studentId }, { enabled: Number.isInteger(studentId) && studentId > 0 });
  const saveBoard = trpc.boards.save.useMutation({ onSuccess: () => detail.refetch() });
  const uploadImage = trpc.boards.uploadImage.useMutation();
  const sendNote = trpc.messages.teacherNote.useMutation({ onSuccess: () => { setNote(""); detail.refetch(); } });
  const updateStudent = trpc.students.update.useMutation({ onSuccess: () => { setEditVisible(false); detail.refetch(); } });
  const deleteStudent = trpc.students.delete.useMutation({ onSuccess: () => router.replace("/teacher") });
  const toggleAttendance = trpc.attendance.toggle.useMutation({ onSuccess: () => detail.refetch() });
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [workingElements, setWorkingElements] = useState<BoardElement[]>([]);
  const [workingCanvasHeight, setWorkingCanvasHeight] = useState(560);
  const [workingThemeKey, setWorkingThemeKey] = useState("classic");
  const [workingThemeColors, setWorkingThemeColors] = useState<CustomThemeColors | null>(null);
  const [boardSaveStatus, setBoardSaveStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [note, setNote] = useState("");
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editPin, setEditPin] = useState("");
  const hydratedBoardRef = useRef<string | null>(null);
  const boardSnapshotRef = useRef({ monthKey: selectedMonth, elements: [] as BoardElement[], canvasHeight: 560, themeKey: "classic", themeColors: null as CustomThemeColors | null });
  const boardDirtyRef = useRef(false);
  const boardRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueAutoSaveRef = useRef<() => void>(() => {});
  const saveOnExitRef = useRef<() => void>(() => {});

  const boards = useMemo(() => detail.data?.boards ?? [], [detail.data?.boards]);
  const activeBoard = useMemo(() => boards.find((board) => board.monthKey === selectedMonth), [boards, selectedMonth]);
  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }, []);
  useEffect(() => {
    const hydrationKey = `${selectedMonth}:${activeBoard?.id ?? "new"}`;
    if (hydratedBoardRef.current === hydrationKey) return;
    hydratedBoardRef.current = hydrationKey;
    clearAutoSaveTimer();
    boardDirtyRef.current = false;
    queuedAutoSaveRef.current = false;
    setBoardSaveStatus("saved");
    setWorkingElements((activeBoard?.elements ?? []) as BoardElement[]);
    setWorkingCanvasHeight(activeBoard?.canvasHeight ?? 560);
    setWorkingThemeKey(activeBoard?.themeKey ?? "classic");
    setWorkingThemeColors(activeBoard?.themeColors ?? null);
  }, [activeBoard, clearAutoSaveTimer, selectedMonth]);
  useEffect(() => {
    boardSnapshotRef.current = { monthKey: selectedMonth, elements: workingElements, canvasHeight: workingCanvasHeight, themeKey: workingThemeKey, themeColors: workingThemeColors };
  }, [selectedMonth, workingCanvasHeight, workingElements, workingThemeColors, workingThemeKey]);
  useEffect(() => { if (detail.data?.student) { setEditName(detail.data.student.name); setEditAge(String(detail.data.student.age)); } }, [detail.data?.student]);

  const saveCurrentBoard = useCallback(async (automatic: boolean) => {
    if (saveInFlightRef.current) { queuedAutoSaveRef.current = true; return; }
    const savedRevision = boardRevisionRef.current;
    const snapshot = boardSnapshotRef.current;
    saveInFlightRef.current = true;
    setBoardSaveStatus("saving");
    try {
      await saveBoard.mutateAsync({ studentId, monthKey: snapshot.monthKey, label: monthLabel(snapshot.monthKey), elements: snapshot.elements, canvasHeight: snapshot.canvasHeight, themeKey: snapshot.themeKey, themeColors: snapshot.themeColors });
      if (boardRevisionRef.current === savedRevision) {
        boardDirtyRef.current = false;
        setBoardSaveStatus("saved");
      } else {
        boardDirtyRef.current = true;
        queuedAutoSaveRef.current = true;
        setBoardSaveStatus("pending");
      }
      if (!automatic) Alert.alert("تم الحفظ", "حُفظت سبورة هذا الشهر في سجل الطالب.");
    } catch (error) {
      boardDirtyRef.current = true;
      setBoardSaveStatus("error");
      if (!automatic) Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "حاول مجدداً.");
    } finally {
      saveInFlightRef.current = false;
      if (queuedAutoSaveRef.current && boardDirtyRef.current) {
        queuedAutoSaveRef.current = false;
        queueAutoSaveRef.current();
      }
    }
  }, [saveBoard, studentId]);
  const queueAutoSave = useCallback(() => {
    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => { autoSaveTimerRef.current = null; void saveCurrentBoard(true); }, 700);
  }, [clearAutoSaveTimer, saveCurrentBoard]);
  useEffect(() => { queueAutoSaveRef.current = queueAutoSave; }, [queueAutoSave]);
  useEffect(() => { saveOnExitRef.current = () => { clearAutoSaveTimer(); if (boardDirtyRef.current) void saveCurrentBoard(true); }; }, [clearAutoSaveTimer, saveCurrentBoard]);
  useEffect(() => () => saveOnExitRef.current(), []);
  const markBoardChanged = useCallback(() => {
    boardDirtyRef.current = true;
    boardRevisionRef.current += 1;
    setBoardSaveStatus("pending");
    queueAutoSaveRef.current();
  }, []);
  const handleElementsChange = useCallback((elements: BoardElement[]) => { boardSnapshotRef.current = { ...boardSnapshotRef.current, elements }; setWorkingElements(elements); markBoardChanged(); }, [markBoardChanged]);
  const handleCanvasHeightChange = useCallback((height: number) => { boardSnapshotRef.current = { ...boardSnapshotRef.current, canvasHeight: height }; setWorkingCanvasHeight(height); markBoardChanged(); }, [markBoardChanged]);
  const handleThemeChange = useCallback((themeKey: string) => { boardSnapshotRef.current = { ...boardSnapshotRef.current, themeKey }; setWorkingThemeKey(themeKey); markBoardChanged(); }, [markBoardChanged]);
  const handleThemeColorsChange = useCallback((themeColors: CustomThemeColors | null) => { boardSnapshotRef.current = { ...boardSnapshotRef.current, themeColors }; setWorkingThemeColors(themeColors); markBoardChanged(); }, [markBoardChanged]);
  const persistBoard = async () => { clearAutoSaveTimer(); await saveCurrentBoard(false); };
  const leaveStudent = async () => { clearAutoSaveTimer(); if (boardDirtyRef.current) await saveCurrentBoard(true); router.back(); };
  const addMonth = async () => {
    const lastMonth = boards.length ? boards[0].monthKey : selectedMonth;
    const month = nextMonthKey(lastMonth);
    try { await saveBoard.mutateAsync({ studentId, monthKey: month, label: monthLabel(month), elements: [], canvasHeight: 560, themeKey: "classic", themeColors: null }); setSelectedMonth(month); } catch (error) { Alert.alert("تعذر إضافة الشهر", error instanceof Error ? error.message : "حاول مجدداً."); }
  };
  const submitNote = async () => { if (!note.trim()) return; try { const result = await sendNote.mutateAsync({ studentId, content: note }); Alert.alert("أُرسلت الملاحظة", result.notification.delivered ? "وصل التنبيه إلى هاتف ولي الأمر المسجّل." : "حُفظت الملاحظة في سجل ولي الأمر، وسيصل التنبيه عند تسجيل جهازه." ); } catch (error) { Alert.alert("تعذر الإرسال", error instanceof Error ? error.message : "حاول مجدداً."); } };
  const saveProfile = async () => { const parsedAge = Number(editAge); if (!editName.trim() || !Number.isInteger(parsedAge)) { Alert.alert("تحقق من البيانات", "اكتب الاسم والعمر بشكل صحيح."); return; } try { await updateStudent.mutateAsync({ id: studentId, data: { name: editName, age: parsedAge, ...(editPin.trim() ? { parentPin: editPin } : {}) } }); setEditPin(""); } catch (error) { Alert.alert("تعذر التحديث", error instanceof Error ? error.message : "حاول مجدداً."); } };
  const confirmDelete = () => Alert.alert("حذف الطالب", "سيُحذف سجل الطالب وسبوراته ورسائله نهائياً.", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => deleteStudent.mutate({ id: studentId }) }]);
  const toggleTodayAttendance = async (period: "morning" | "evening") => { try { await toggleAttendance.mutateAsync({ studentId, period }); } catch (error) { Alert.alert("تعذر تسجيل الغياب", error instanceof Error ? error.message : "حاول مجدداً."); } };

  if (detail.isLoading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ فتح ملف الطالب…</Text></ScreenContainer>;
  if (!detail.data) return <ScreenContainer className="items-center justify-center p-5"><Text style={uiStyles.pageSubtitle}>تعذر العثور على ملف الطالب.</Text><SecondaryButton label="العودة للقائمة" onPress={() => router.back()} /></ScreenContainer>;
  const student = detail.data.student;
  const todayKey = new Date();
  const dateKey = `${todayKey.getFullYear()}-${String(todayKey.getMonth() + 1).padStart(2, "0")}-${String(todayKey.getDate()).padStart(2, "0")}`;
  const todayAttendance = detail.data.attendance.find((record) => record.dateKey === dateKey);
  const boardSaveText = boardSaveStatus === "saving" ? "جارٍ الحفظ التلقائي…" : boardSaveStatus === "pending" ? "تغييراتك محفوظة تلقائياً بعد لحظات" : boardSaveStatus === "error" ? "تعذر الحفظ التلقائي — استخدم حفظ الآن" : "كل التغييرات محفوظة";
  const boardSaveColor = boardSaveStatus === "error" ? colors.rose : boardSaveStatus === "saved" ? colors.green : colors.muted;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.container}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.topRow}><Pressable onPress={() => void leaveStudent()} style={styles.iconButton}><AppIcon name="arrow-forward" /></Pressable><View style={styles.topActions}><Pressable onPress={() => setEditVisible(true)} style={styles.iconButton}><AppIcon name="edit" /></Pressable><Pressable onPress={confirmDelete} style={styles.iconButton}><AppIcon name="delete-outline" color={colors.rose} /></Pressable></View></View>
    <Surface style={styles.profileCard}><View style={styles.studentBadge}><Text style={styles.studentBadgeText}>{student.name.slice(0, 1)}</Text></View><View style={styles.profileTexts}><Text style={uiStyles.pageTitle}>{student.name}</Text><Text style={uiStyles.pageSubtitle}>{student.age} سنة · الرمز السري محفوظ بأمان</Text></View></Surface>
    <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>سبورة الطالب</Text><Text style={styles.sectionHint}>سجل شهري محفوظ</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.months}>{[...boards].sort((a, b) => b.monthKey.localeCompare(a.monthKey)).map((board) => <Pressable key={board.id} onPress={() => setSelectedMonth(board.monthKey)} style={[styles.monthChip, selectedMonth === board.monthKey && styles.monthChipSelected]}><Text style={[styles.monthChipText, selectedMonth === board.monthKey && styles.monthChipTextSelected]}>{board.label}</Text></Pressable>)}<Pressable onPress={addMonth} style={styles.addMonth}><AppIcon name="add" color={colors.green} size={19} /><Text style={styles.addMonthText}>شهر جديد</Text></Pressable></ScrollView>
    <Text style={styles.activeMonth}>{activeBoard ? activeBoard.label : `${monthLabel(selectedMonth)} — سبورة جديدة`}</Text>
    <Surface style={styles.attendanceCard}><View style={styles.attendanceHeader}><AppIcon name="event-busy" color={colors.rose} /><View><Text style={styles.attendanceTitle}>غياب اليوم</Text><Text style={styles.attendanceDate}>يوم {attendanceDateLabel(dateKey)}</Text></View></View><View style={styles.attendanceActions}><Pressable disabled={toggleAttendance.isPending} onPress={() => toggleTodayAttendance("morning")} style={({ pressed }) => [styles.attendanceAction, todayAttendance?.morningAbsent && styles.attendanceActionMorning, (pressed || toggleAttendance.isPending) && styles.pressed]}><Text style={[styles.attendanceActionText, todayAttendance?.morningAbsent && styles.attendanceActionTextActive]}>{todayAttendance?.morningAbsent ? "إلغاء غياب صباحي" : "غياب صباحي"}</Text></Pressable><Pressable disabled={toggleAttendance.isPending} onPress={() => toggleTodayAttendance("evening")} style={({ pressed }) => [styles.attendanceAction, todayAttendance?.eveningAbsent && styles.attendanceActionEvening, (pressed || toggleAttendance.isPending) && styles.pressed]}><Text style={[styles.attendanceActionText, todayAttendance?.eveningAbsent && styles.attendanceActionTextActive]}>{todayAttendance?.eveningAbsent ? "إلغاء غياب مسائي" : "غياب مسائي"}</Text></Pressable></View></Surface>
    <BoardCanvas boardKey={selectedMonth} initialElements={(activeBoard?.elements ?? []) as BoardElement[]} initialCanvasHeight={workingCanvasHeight} initialThemeKey={workingThemeKey} initialThemeColors={workingThemeColors} attendanceRecords={detail.data.attendance} editable onElementsChange={handleElementsChange} onCanvasHeightChange={handleCanvasHeightChange} onThemeChange={handleThemeChange} onThemeColorsChange={handleThemeColorsChange} onUploadImage={async (base64, mimeType) => { const result = await uploadImage.mutateAsync({ studentId, base64, mimeType }); return result.url; }} />
    <View style={styles.saveStatus}><AppIcon name="save" color={boardSaveColor} size={17} /><Text style={[styles.saveStatusText, { color: boardSaveColor }]}>{boardSaveText}</Text></View>
    <PrimaryButton label={saveBoard.isPending ? "جارٍ الحفظ…" : "حفظ الآن"} icon="save" disabled={saveBoard.isPending} onPress={persistBoard} />
    <Surface style={styles.noteCard}><View style={styles.noteHead}><AppIcon name="notifications-active" color={colors.gold} /><Text style={styles.noteTitle}>ملاحظة لولي الأمر</Text></View><TextInput multiline value={note} onChangeText={setNote} placeholder="اكتب ملاحظة عن الطالب، وستظهر لولي الأمر مع تنبيه…" placeholderTextColor="#92A098" style={styles.noteInput} textAlign="right" /><PrimaryButton label={sendNote.isPending ? "جارٍ الإرسال…" : "إرسال الملاحظة"} icon="send" disabled={sendNote.isPending || !note.trim()} onPress={submitNote} /></Surface>
    <Text style={styles.sectionTitle}>آخر الرسائل</Text>
    {detail.data.messages.length ? detail.data.messages.slice(-4).reverse().map((message) => <View key={message.id} style={[styles.message, message.senderRole === "teacher" ? styles.teacherMessage : styles.parentMessage]}><Text style={styles.messageRole}>{message.senderRole === "teacher" ? "المعلم" : "ولي الأمر"}{message.isNote ? " · ملاحظة" : ""}</Text><Text style={styles.messageContent}>{message.content}</Text></View>) : <Text style={uiStyles.pageSubtitle}>لا توجد رسائل لهذا الطالب بعد.</Text>}
  </ScrollView><Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><Text style={uiStyles.pageTitle}>تعديل بيانات الطالب</Text><FormField label="الاسم" value={editName} onChangeText={setEditName} /><FormField label="العمر" value={editAge} onChangeText={setEditAge} keyboardType="number-pad" /><FormField label="رمز جديد لولي الأمر (اختياري)" value={editPin} onChangeText={setEditPin} placeholder="اتركه فارغاً للإبقاء على الرمز" secureTextEntry /><PrimaryButton label={updateStudent.isPending ? "جارٍ التحديث…" : "حفظ التعديلات"} icon="save" disabled={updateStudent.isPending} onPress={saveProfile} /><SecondaryButton label="إلغاء" onPress={() => setEditVisible(false)} /></View></View></Modal></ScreenContainer>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.paper }, content: { gap: 16, padding: 16, paddingBottom: 34 },
  topRow: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, topActions: { flexDirection: "row-reverse", gap: 8 }, iconButton: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 13, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  profileCard: { alignItems: "center", flexDirection: "row-reverse", gap: 13 }, studentBadge: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 21, height: 52, justifyContent: "center", width: 52 }, studentBadgeText: { color: colors.green, fontSize: 24, fontWeight: "900" }, profileTexts: { flex: 1, gap: 3 },
  sectionTitleRow: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 4 }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, sectionHint: { color: colors.muted, fontSize: 12, writingDirection: "rtl" },
  months: { flexDirection: "row", gap: 8 }, monthChip: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 }, monthChipSelected: { backgroundColor: colors.green, borderColor: colors.green }, monthChipText: { color: colors.green, fontSize: 13, fontWeight: "800", writingDirection: "rtl" }, monthChipTextSelected: { color: colors.white }, addMonth: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 14, flexDirection: "row", gap: 3, paddingHorizontal: 11 }, addMonthText: { color: colors.green, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, activeMonth: { color: colors.muted, fontSize: 14, textAlign: "right", writingDirection: "rtl" },
  noteCard: { gap: 12 }, noteHead: { alignItems: "center", flexDirection: "row-reverse", gap: 8 }, noteTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", writingDirection: "rtl" }, noteInput: { borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 108, padding: 12, writingDirection: "rtl" },
  attendanceCard: { gap: 11 }, attendanceHeader: { alignItems: "center", flexDirection: "row-reverse", gap: 8 }, attendanceTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, attendanceDate: { color: colors.muted, fontSize: 12, textAlign: "right", writingDirection: "rtl" }, attendanceActions: { flexDirection: "row-reverse", gap: 9 }, attendanceAction: { alignItems: "center", backgroundColor: colors.paleGold, borderRadius: 11, flex: 1, paddingVertical: 10 }, attendanceActionMorning: { backgroundColor: "#B23A48" }, attendanceActionEvening: { backgroundColor: "#792934" }, attendanceActionText: { color: colors.ink, fontSize: 12, fontWeight: "900", writingDirection: "rtl" }, attendanceActionTextActive: { color: colors.white },
  saveStatus: { alignItems: "center", flexDirection: "row-reverse", gap: 6, justifyContent: "center", marginTop: -3 }, saveStatusText: { fontSize: 12, fontWeight: "700", textAlign: "center", writingDirection: "rtl" },
  message: { borderRadius: 15, gap: 5, padding: 13 }, teacherMessage: { backgroundColor: colors.paleGreen }, parentMessage: { backgroundColor: colors.paleGold }, messageRole: { color: colors.green, fontSize: 12, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, messageContent: { color: colors.ink, fontSize: 14, lineHeight: 21, textAlign: "right", writingDirection: "rtl" },
  modalBackdrop: { backgroundColor: "rgba(20,40,32,0.45)", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 14, padding: 22, paddingBottom: 30 }, sheetHandle: { alignSelf: "center", backgroundColor: "#C4CEC7", borderRadius: 3, height: 5, width: 46 }, pressed: { opacity: 0.7 },
});
