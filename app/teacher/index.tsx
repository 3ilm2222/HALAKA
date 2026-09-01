import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, SecondaryButton, Surface, uiStyles } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { exportBackupFile, getLastBackupAt, pickBackupFile } from "@/lib/backup-file";
import { clearTeacherSessionToken, loadTeacherSessionToken, saveTeacherSessionToken } from "@/lib/teacher-session";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";

export default function TeacherHomeScreen() {
  const params = useLocalSearchParams<{ google?: string }>();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [pin, setPin] = useState("");
  const [backupVisible, setBackupVisible] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => { Promise.all([loadTeacherSessionToken(), getLastBackupAt()]).then(([token, backupAt]) => { setSessionToken(token); setLastBackupAt(backupAt); }).finally(() => setSessionLoading(false)); }, []);
  const accessStatus = trpc.teacherAccess.status.useQuery();
  const setupTeacher = trpc.teacherAccess.setup.useMutation();
  const loginTeacher = trpc.teacherAccess.login.useMutation();
  const resetTeacher = trpc.teacherAccess.resetPin.useMutation();
  const linkGoogle = trpc.teacherAccess.linkGoogle.useMutation();
  const loginGoogle = trpc.teacherAccess.loginGoogle.useMutation();
  const logoutTeacher = trpc.teacherAccess.logout.useMutation();
  const backupExport = trpc.backup.export.useQuery(undefined, { enabled: false });
  const backupImport = trpc.backup.import.useMutation();
  const cloudStatus = trpc.backup.cloudStatus.useQuery(undefined, { enabled: Boolean(sessionToken) });
  const enableDailyCloud = trpc.backup.enableDailyCloud.useMutation();
  const createCloudNow = trpc.backup.createCloudNow.useMutation({ onSuccess: () => cloudStatus.refetch() });
  const restoreCloudLatest = trpc.backup.restoreCloudLatest.useMutation({ onSuccess: () => { studentsQuery.refetch(); cloudStatus.refetch(); } });
  const studentsQuery = trpc.students.list.useQuery(undefined, { enabled: Boolean(sessionToken) });
  const toggleAttendance = trpc.attendance.toggle.useMutation({ onSuccess: () => studentsQuery.refetch() });
  const createStudent = trpc.students.create.useMutation({ onSuccess: () => { setFormVisible(false); setName(""); setAge(""); setPin(""); studentsQuery.refetch(); } });

  useEffect(() => { if (sessionToken) enableDailyCloud.mutate(); }, [enableDailyCloud, sessionToken]);
  useEffect(() => {
    if (params.google !== "1") return;
    const completeGoogleLogin = async () => {
      try {
        if (sessionToken) {
          await linkGoogle.mutateAsync();
          await accessStatus.refetch();
          Alert.alert("تم ربط Google", "يمكنك الآن الدخول عبر Google أو رمز المعلم.");
        } else {
          const result = await loginGoogle.mutateAsync();
          await saveTeacherSessionToken(result.token);
          setSessionToken(result.token);
          Alert.alert("تم الدخول", "تم الدخول عبر Google بنجاح.");
        }
      } catch (error) {
        Alert.alert("تعذر دخول Google", error instanceof Error ? error.message : "سجّل الدخول بالرمز أولاً لربط حساب Google.");
      } finally { router.replace("/teacher"); }
    };
    void completeGoogleLogin();
  }, [accessStatus, linkGoogle, loginGoogle, params.google, sessionToken]);

  const addStudent = async () => {
    const parsedAge = Number(age);
    if (!name.trim() || !Number.isInteger(parsedAge) || !pin.trim()) { Alert.alert("بيانات غير مكتملة", "أدخل اسم الطالب وعمره والرمز السري لولي الأمر."); return; }
    try { await createStudent.mutateAsync({ name, age: parsedAge, parentPin: pin }); } catch (error) { Alert.alert("تعذر الحفظ", error instanceof Error ? error.message : "حاول مجدداً."); }
  };

  const completeTeacherLogin = async (mode: "setup" | "login" | "reset", accessPin: string) => {
    try {
      const result = mode === "setup" ? await setupTeacher.mutateAsync({ pin: accessPin }) : mode === "reset" ? await resetTeacher.mutateAsync({ pin: accessPin }) : await loginTeacher.mutateAsync({ pin: accessPin });
      await saveTeacherSessionToken(result.token);
      setSessionToken(result.token);
    } catch (error) {
      Alert.alert(mode === "setup" ? "تعذر إعداد الرمز" : mode === "reset" ? "تعذرت إعادة التعيين" : "تعذر تسجيل الدخول", error instanceof Error ? error.message : "حاول مجدداً.");
    }
  };

  const logout = async () => {
    try { await logoutTeacher.mutateAsync(); } catch { /* إزالة الجلسة محلياً كافية عند تعذر الشبكة. */ }
    await clearTeacherSessionToken();
    setSessionToken(null);
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await backupExport.refetch();
      if (!result.data) throw new Error("تعذر جمع بيانات النسخة الاحتياطية");
      const saved = await exportBackupFile(result.data);
      setLastBackupAt(saved.exportedAt);
      Alert.alert("تم إنشاء النسخة", `احفظ ملف ${saved.filename} في «الملفات» أو Google Drive أو أرسله إلى بريدك.`);
    } catch (error) { Alert.alert("تعذر التصدير", error instanceof Error ? error.message : "حاول مجدداً."); } finally { setBackupBusy(false); }
  };

  const restoreBackup = async (backup: unknown) => {
    setBackupBusy(true);
    try {
      const restored = await backupImport.mutateAsync(backup as never);
      await studentsQuery.refetch();
      Alert.alert("تمت الاستعادة", `أضيف ${restored.studentsImported} طالب و${restored.boardsImported} سجل شهري و${restored.messagesImported} رسالة.`);
      setBackupVisible(false);
    } catch (error) { Alert.alert("تعذرت الاستعادة", error instanceof Error ? error.message : "تحقق من أن الملف صادر من هذا التطبيق."); } finally { setBackupBusy(false); }
  };

  const importBackup = async () => {
    try {
      const backup = await pickBackupFile();
      if (!backup) return;
      Alert.alert("استعادة النسخة الاحتياطية", "ستُضاف بيانات الطلاب غير الموجودة فقط، ولن تُحذف البيانات الحالية. هل تريد المتابعة؟", [{ text: "إلغاء", style: "cancel" }, { text: "استعادة", style: "destructive", onPress: () => void restoreBackup(backup) }]);
    } catch (error) { Alert.alert("تعذر قراءة الملف", error instanceof Error ? error.message : "اختر ملف النسخة الاحتياطية الصحيح."); }
  };

  if (sessionLoading || accessStatus.isLoading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ فتح بوابة المعلم…</Text></ScreenContainer>;
  if (!sessionToken) return <TeacherGate configured={Boolean(accessStatus.data?.configured)} googleLinked={Boolean(accessStatus.data?.googleLinked)} busy={setupTeacher.isPending || loginTeacher.isPending || resetTeacher.isPending || loginGoogle.isPending} onSubmit={completeTeacherLogin} onGoogle={() => void startOAuthLogin()} />;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.container}>
      <FlatList
        data={studentsQuery.data ?? []}
        keyExtractor={(student) => String(student.id)}
        refreshControl={<RefreshControl refreshing={studentsQuery.isRefetching} onRefresh={() => studentsQuery.refetch()} tintColor={colors.green} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}><View><Text style={uiStyles.pageTitle}>طلابي</Text><Text style={uiStyles.pageSubtitle}>مرحباً أيها المعلم، تابِع سجلات الطلاب الشهرية.</Text></View><View style={styles.headerActions}><Pressable onPress={() => void startOAuthLogin()} style={styles.google}><AppIcon name="account-circle" color={colors.gold} size={22} /></Pressable><Pressable onPress={() => setBackupVisible(true)} style={styles.backup}><AppIcon name="backup" color={colors.green} size={22} /></Pressable><Pressable onPress={logout} style={styles.logout}><AppIcon name="logout" color={colors.rose} size={22} /></Pressable></View></View>
            <PrimaryButton label="إضافة طالب" icon="person-add" onPress={() => setFormVisible(true)} />
            <Text style={styles.count}>{studentsQuery.data?.length ?? 0} طالب مسجّل</Text>
          </View>
        }
        renderItem={({ item }) => <StudentCard student={item} onToggle={(period) => toggleAttendance.mutate({ studentId: item.id, period })} toggling={toggleAttendance.isPending} />}
        ListEmptyComponent={!studentsQuery.isLoading ? <EmptyStudents onAdd={() => setFormVisible(true)} /> : <Text style={uiStyles.pageSubtitle}>جارٍ تحميل القائمة…</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 11 }} />}
      />
      <StudentForm visible={formVisible} name={name} age={age} pin={pin} onName={setName} onAge={setAge} onPin={setPin} onClose={() => setFormVisible(false)} onSave={addStudent} saving={createStudent.isPending} />
      <BackupSheet visible={backupVisible} busy={backupBusy || createCloudNow.isPending || restoreCloudLatest.isPending} lastBackupAt={lastBackupAt} cloudBackupAt={cloudStatus.data?.createdAt?.toString() ?? null} onClose={() => setBackupVisible(false)} onExport={exportBackup} onImport={importBackup} onCloudNow={() => createCloudNow.mutate()} onRestoreCloud={() => Alert.alert("استعادة النسخة السحابية", "ستُضاف بيانات الطلاب غير الموجودة فقط، ولن تُحذف البيانات الحالية. هل تريد المتابعة؟", [{ text: "إلغاء", style: "cancel" }, { text: "استعادة", style: "destructive", onPress: () => restoreCloudLatest.mutate() }])} />
    </ScreenContainer>
  );
}

function TeacherGate({ configured, googleLinked, busy, onSubmit, onGoogle }: { configured: boolean; googleLinked: boolean; busy: boolean; onSubmit: (mode: "setup" | "login" | "reset", pin: string) => Promise<void>; onGoogle: () => void }) {
  const [accessPin, setAccessPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const submit = () => {
    if (accessPin.trim().length < 4) { Alert.alert("رمز قصير", "اكتب رمزاً من أربعة أرقام أو أحرف على الأقل."); return; }
    if ((!configured || resetMode) && accessPin !== confirmPin) { Alert.alert("الرمزان غير متطابقين", "أعد كتابة الرمز نفسه للتأكيد."); return; }
    onSubmit(!configured ? "setup" : resetMode ? "reset" : "login", accessPin.trim());
  };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gate}>
    <View style={styles.gateIcon}><AppIcon name="lock" color={colors.green} size={38} /></View>
    <Text style={uiStyles.pageTitle}>{resetMode ? "إعادة تعيين رمز المعلم" : configured ? "دخول المعلم" : "إعداد دخول المعلم"}</Text>
    <Text style={[uiStyles.pageSubtitle, styles.center]}>{resetMode ? "أنشئ رمزاً جديداً إذا نسيت الرمز السابق. سيبقى الطلاب والسجلات محفوظين، وستُسجَّل خروج الجلسات القديمة." : configured ? "اكتب رمز المعلم للدخول إلى سجلات الطلاب." : "أنشئ رمزاً بسيطاً للمعلم. لن تحتاج إلى Google، وسيُحفظ الدخول على هذا الجهاز."}</Text>
    <View style={styles.gateForm}><FormField label="رمز المعلم" value={accessPin} onChangeText={setAccessPin} placeholder="٤ خانات أو أكثر" secureTextEntry keyboardType="default" />{(!configured || resetMode) ? <FormField label="تأكيد الرمز" value={confirmPin} onChangeText={setConfirmPin} placeholder="أعد كتابة الرمز" secureTextEntry keyboardType="default" /> : null}</View>
    <PrimaryButton label={busy ? "جارٍ التحقق…" : resetMode ? "حفظ الرمز الجديد" : configured ? "دخول المعلم" : "حفظ الرمز والدخول"} icon={resetMode ? "lock-reset" : "login"} disabled={busy} onPress={submit} style={{ width: "100%" }} />
    {configured ? <SecondaryButton label={resetMode ? "العودة إلى الدخول" : "نسيت الرمز؟ أعد تعيينه"} icon={resetMode ? "login" : "lock-reset"} onPress={() => { setResetMode(!resetMode); setAccessPin(""); setConfirmPin(""); }} /> : null}
    {configured && googleLinked && !resetMode ? <SecondaryButton label="الدخول عبر Google" icon="account-circle" onPress={onGoogle} /> : null}
    {configured && !googleLinked && !resetMode ? <Text style={styles.googleHint}>يمكنك ربط Google من زر الحساب بعد الدخول بالرمز مرة واحدة.</Text> : null}
    <SecondaryButton label="العودة للبداية" icon="arrow-forward" onPress={() => router.replace("/")} />
  </ScreenContainer>;
}

function StudentCard({ student, onToggle, toggling }: { student: { id: number; name: string; age: number; morningAbsent?: boolean; eveningAbsent?: boolean }; onToggle: (period: "morning" | "evening") => void; toggling: boolean }) {
  const fullDayAbsent = Boolean(student.morningAbsent && student.eveningAbsent);
  const partiallyAbsent = Boolean(student.morningAbsent || student.eveningAbsent);
  return <View style={[styles.studentCard, fullDayAbsent && styles.fullAbsentCard, !fullDayAbsent && partiallyAbsent && styles.partialAbsentCard]}><Pressable onPress={() => router.push({ pathname: "/teacher/student/[id]", params: { id: String(student.id) } } as never)} style={({ pressed }) => [styles.studentOpen, pressed && styles.pressed]}><View style={[styles.avatar, fullDayAbsent && styles.fullAbsentAvatar, !fullDayAbsent && partiallyAbsent && styles.partialAbsentAvatar]}><Text style={styles.avatarText}>{student.name.trim().slice(0, 1)}</Text></View><View style={styles.studentText}><Text style={[styles.studentName, fullDayAbsent && styles.fullAbsentText]}>{student.name}</Text><Text style={[styles.studentMeta, fullDayAbsent && styles.fullAbsentText]}>{fullDayAbsent ? "غائب اليوم كاملاً" : partiallyAbsent ? "غياب مسجّل اليوم" : `${student.age} سنة · سجل شهري وملاحظات`}</Text></View><AppIcon name="chevron-left" color={fullDayAbsent ? colors.white : colors.muted} size={24} /></Pressable><View style={styles.attendanceButtons}><Pressable disabled={toggling} onPress={() => onToggle("morning")} style={({ pressed }) => [styles.attendanceButton, student.morningAbsent && styles.morningAbsentButton, (pressed || toggling) && styles.pressed]}><Text style={[styles.attendanceButtonText, student.morningAbsent && styles.absentButtonText]}>صباح</Text></Pressable><Pressable disabled={toggling} onPress={() => onToggle("evening")} style={({ pressed }) => [styles.attendanceButton, student.eveningAbsent && styles.eveningAbsentButton, (pressed || toggling) && styles.pressed]}><Text style={[styles.attendanceButtonText, student.eveningAbsent && styles.absentButtonText]}>مساء</Text></Pressable></View></View>;
}

function EmptyStudents({ onAdd }: { onAdd: () => void }) {
  return <Surface style={styles.empty}><AppIcon name="auto-stories" color={colors.gold} size={38} /><Text style={styles.emptyTitle}>لم تضف طلاباً بعد</Text><Text style={[uiStyles.pageSubtitle, styles.center]}>ابدأ بإضافة الطالب وأنشئ له رمزاً خاصاً لولي الأمر.</Text><PrimaryButton label="إضافة أول طالب" icon="person-add" onPress={onAdd} /></Surface>;
}

function StudentForm({ visible, name, age, pin, onName, onAge, onPin, onClose, onSave, saving }: { visible: boolean; name: string; age: string; pin: string; onName: (value: string) => void; onAge: (value: string) => void; onPin: (value: string) => void; onClose: () => void; onSave: () => void; saving: boolean }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><Text style={uiStyles.pageTitle}>إضافة طالب</Text><Text style={uiStyles.pageSubtitle}>سيستخدم ولي الأمر الاسم والرمز للدخول إلى السجل.</Text><FormField label="اسم الطالب" value={name} onChangeText={onName} placeholder="مثال: أحمد محمد" /><FormField label="العمر" value={age} onChangeText={onAge} placeholder="10" keyboardType="number-pad" /><FormField label="رمز ولي الأمر" value={pin} onChangeText={onPin} placeholder="رمز من 4 خانات أو أكثر" secureTextEntry /><PrimaryButton label={saving ? "جارٍ الحفظ…" : "حفظ الطالب"} icon="save" disabled={saving} onPress={onSave} /><SecondaryButton label="إلغاء" onPress={onClose} /></View></View></Modal>;
}

function BackupSheet({ visible, busy, lastBackupAt, cloudBackupAt, onClose, onExport, onImport, onCloudNow, onRestoreCloud }: { visible: boolean; busy: boolean; lastBackupAt: string | null; cloudBackupAt: string | null; onClose: () => void; onExport: () => void; onImport: () => void; onCloudNow: () => void; onRestoreCloud: () => void }) {
  const lastBackupLabel = lastBackupAt ? new Date(lastBackupAt).toLocaleString("ar") : "لم تُنشئ نسخة بعد";
  const cloudBackupLabel = cloudBackupAt ? new Date(cloudBackupAt).toLocaleString("ar") : "بانتظار أول نسخة يومية";
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHandle} /><Text style={uiStyles.pageTitle}>النسخ الاحتياطي</Text><Text style={uiStyles.pageSubtitle}>احفظ نسخة محلية في «الملفات»، وتُحدَّث نسخة سحابية واحدة تلقائياً كل يوم. لا تشارك الملف المحلي لأنه يتضمن بيانات دخول أولياء الأمور.</Text><View style={styles.backupStatus}><AppIcon name="history" color={colors.gold} size={19} /><Text style={styles.backupStatusText}>آخر تصدير محلي: {lastBackupLabel}</Text></View><View style={styles.cloudStatus}><AppIcon name="cloud-done" color={colors.green} size={19} /><Text style={styles.backupStatusText}>آخر نسخة سحابية: {cloudBackupLabel}</Text></View><PrimaryButton label={busy ? "جارٍ التنفيذ…" : "تصدير نسخة محلية"} icon="backup" disabled={busy} onPress={onExport} /><SecondaryButton label="إنشاء نسخة سحابية الآن" icon="cloud-upload" onPress={onCloudNow} /><SecondaryButton label="استعادة أحدث نسخة سحابية" icon="cloud-download" onPress={onRestoreCloud} /><SecondaryButton label="استيراد نسخة محفوظة" icon="restore" onPress={onImport} /><SecondaryButton label="إغلاق" onPress={onClose} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.paper },
  gate: { alignItems: "center", backgroundColor: colors.paper, gap: 18, justifyContent: "center", paddingHorizontal: 26 },
  gateIcon: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 28, height: 82, justifyContent: "center", width: 82 },
  gateForm: { gap: 12, width: "100%" },
  center: { textAlign: "center" },
  listContent: { flexGrow: 1, padding: 18 },
  header: { gap: 15, marginBottom: 16 },
  headerRow: { alignItems: "flex-start", flexDirection: "row-reverse", justifyContent: "space-between" },
  headerActions: { flexDirection: "row-reverse", gap: 8 },
  google: { alignItems: "center", backgroundColor: colors.paleGold, borderRadius: 14, height: 46, justifyContent: "center", width: 46 },
  backup: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 14, height: 46, justifyContent: "center", width: 46 },
  logout: { alignItems: "center", backgroundColor: "#F9E9E9", borderRadius: 14, height: 46, justifyContent: "center", width: 46 },
  count: { color: colors.muted, fontSize: 13, textAlign: "right", writingDirection: "rtl" },
  studentCard: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 10, minHeight: 100, padding: 13 }, studentOpen: { alignItems: "center", flexDirection: "row-reverse", gap: 12 }, partialAbsentCard: { backgroundColor: "#FDEBEC", borderColor: "#EFA5AA" }, fullAbsentCard: { backgroundColor: "#26352F", borderColor: "#26352F" },
  avatar: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 20, height: 44, justifyContent: "center", width: 44 }, partialAbsentAvatar: { backgroundColor: "#F8C9CD" }, fullAbsentAvatar: { backgroundColor: "#3C554A" },
  avatarText: { color: colors.green, fontSize: 20, fontWeight: "900" },
  studentText: { flex: 1, gap: 4 },
  studentName: { color: colors.ink, fontSize: 17, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  studentMeta: { color: colors.muted, fontSize: 12, textAlign: "right", writingDirection: "rtl" }, fullAbsentText: { color: colors.white },
  attendanceButtons: { flexDirection: "row-reverse", gap: 8 }, attendanceButton: { alignItems: "center", backgroundColor: colors.paleGold, borderRadius: 10, flex: 1, paddingVertical: 8 }, morningAbsentButton: { backgroundColor: "#B23A48" }, eveningAbsentButton: { backgroundColor: "#792934" }, attendanceButtonText: { color: colors.ink, fontSize: 12, fontWeight: "900", writingDirection: "rtl" }, absentButtonText: { color: colors.white },
  empty: { alignItems: "center", gap: 12, marginTop: 40, paddingVertical: 30 },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", writingDirection: "rtl" },
  pressed: { opacity: 0.7 },
  modalBackdrop: { backgroundColor: "rgba(20,40,32,0.45)", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 14, padding: 22, paddingBottom: 30 },
  sheetHandle: { alignSelf: "center", backgroundColor: "#C4CEC7", borderRadius: 3, height: 5, width: 46 },
  backupStatus: { alignItems: "center", backgroundColor: colors.paleGold, borderRadius: 12, flexDirection: "row-reverse", gap: 8, padding: 11 },
  cloudStatus: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 12, flexDirection: "row-reverse", gap: 8, padding: 11 },
  backupStatusText: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  googleHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", writingDirection: "rtl" },
});
