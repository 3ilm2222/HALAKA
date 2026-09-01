import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Network from "expo-network";
import { router } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, SecondaryButton, Surface, uiStyles } from "@/components/app-ui";
import { ScreenContainer } from "@/components/screen-container";
import { clearCloudTeacherSession, loadCloudTeacherSession } from "@/lib/cloud-teacher-session";
import { cacheAttendanceRecord, cacheStudent, cacheTeacherMessage, cacheTeacherSnapshot, createOfflineId, enqueueTeacherMutation, flushTeacherOfflineQueue, isTeacherInternetAvailable, loadTeacherOfflineCache } from "@/lib/cloud-teacher-offline";
import { localDateKey } from "@/lib/local-date";
import { arrangeSessionStudents, attendanceTone, type AttendanceTone } from "@/lib/student-session-list";
import { supabaseSchool, type SchoolAttendance, type SchoolMessage, type SchoolNews, type SchoolStudent } from "@/lib/supabase-school-api";

type StudentListItem =
  | { kind: "section"; id: string; title: string; count: number }
  | { kind: "student"; id: string; student: SchoolStudent; tone: AttendanceTone };

export default function CloudTeacherScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [attendance, setAttendance] = useState<SchoolAttendance[]>([]);
  const [messages, setMessages] = useState<SchoolMessage[]>([]);
  const [news, setNews] = useState<SchoolNews[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState("جارٍ التحقق من الاتصال…");
  const [formVisible, setFormVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [newsVisible, setNewsVisible] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [parentPin, setParentPin] = useState("");
  const [newsText, setNewsText] = useState("");
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [today, setToday] = useState(() => localDateKey());
  const [searchQuery, setSearchQuery] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [readyStudentIds, setReadyStudentIds] = useState<Set<string>>(() => new Set());

  const hydrateLocal = useCallback(async () => {
    const cache = await loadTeacherOfflineCache();
    setStudents(cache.students);
    setAttendance(cache.attendance);
    setMessages(Object.values(cache.details).flatMap((detail) => detail.messages));
    setPendingCount(cache.queue.length);
    return cache;
  }, []);

  const refresh = useCallback(async (session = token) => {
    if (!session) return;
    const hasInternet = await isTeacherInternetAvailable().catch(() => false);
    if (!hasInternet) {
      setOnline(false);
      const cache = await hydrateLocal();
      setSyncStatus(cache.students.length ? `وضع دون اتصال · ${cache.queue.length} تعديل بانتظار المزامنة` : "وضع دون اتصال · اتصل بالإنترنت مرة واحدة لفتح القائمة لأول مرة");
      return;
    }
    setOnline(true);
    setSyncing(true);
    try {
      const flushed = await flushTeacherOfflineQueue(session);
      const data = await supabaseSchool.teacherSnapshot(session);
      setStudents(data.students);
      setAttendance(data.attendance);
      setMessages(data.messages);
      setNews(data.news);
      await cacheTeacherSnapshot(data);
      const cache = await loadTeacherOfflineCache();
      setPendingCount(cache.queue.length);
      setSyncStatus(flushed ? `تمت مزامنة ${flushed} تعديل ثم تحديث القائمة` : "كل البيانات متزامنة مع السحابة");
    } catch {
      setOnline(false);
      const cache = await hydrateLocal();
      setSyncStatus(`محفوظ محلياً · ${cache.queue.length} تعديل بانتظار الإنترنت`);
    } finally {
      setSyncing(false);
    }
  }, [hydrateLocal, token]);

  useEffect(() => {
    let mounted = true;
    void loadCloudTeacherSession().then(async (session) => {
      if (!mounted) return;
      setToken(session);
      if (session) {
        await hydrateLocal();
        if (mounted) setLoading(false);
        void refresh(session);
      } else if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [hydrateLocal, refresh]);

  useEffect(() => {
    const listener = Network.addNetworkStateListener((state) => {
      const reachable = state.isInternetReachable !== false;
      setOnline(reachable);
      if (reachable && token) void refresh(token);
    });
    return () => listener.remove();
  }, [refresh, token]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const timer = setTimeout(() => setToday(localDateKey()), Math.max(1_000, nextMidnight - now.getTime() + 250));
    return () => clearTimeout(timer);
  }, [today]);

  const attemptSync = async () => { if (token) await refresh(token); };

  const addStudent = async () => {
    const parsedAge = Number(age);
    if (!token || !name.trim() || !Number.isInteger(parsedAge) || parentPin.length < 4) return Alert.alert("بيانات غير مكتملة", "أدخل الاسم والعمر ورمز ولي الأمر.");
    const id = createOfflineId();
    const now = new Date().toISOString();
    const localStudent: SchoolStudent = { id, teacher_id: "local", name: name.trim(), normalized_name: name.trim(), age: parsedAge, created_at: now, updated_at: now };
    setBusy(true);
    try {
      setStudents((current) => [...current, localStudent]);
      await cacheStudent(localStudent);
      await enqueueTeacherMutation({ type: "upsertStudent", student: { id, clientId: id, name: localStudent.name, age: parsedAge, parentPin } });
      const cache = await loadTeacherOfflineCache();
      setPendingCount(cache.queue.length);
      setName(""); setAge(""); setParentPin(""); setFormVisible(false);
      setSyncStatus("تمت إضافة الطالب محلياً بانتظار المزامنة");
      await attemptSync();
    } catch (error) {
      Alert.alert("تعذر الحفظ المحلي", error instanceof Error ? error.message : "حاول مجدداً");
    } finally {
      setBusy(false);
    }
  };

  const toggleAttendance = async (studentId: string, period: "morning" | "evening") => {
    if (!token) return;
    const existing = attendance.find((entry) => entry.student_id === studentId && entry.date_key === today);
    const absent = period === "morning" ? !(existing?.morning_absent ?? false) : !(existing?.evening_absent ?? false);
    const record: SchoolAttendance = { id: existing?.id ?? `local-${studentId}-${today}`, student_id: studentId, date_key: today, morning_absent: period === "morning" ? absent : existing?.morning_absent ?? false, evening_absent: period === "evening" ? absent : existing?.evening_absent ?? false };
    try {
      setAttendance((current) => [...current.filter((entry) => entry.student_id !== studentId || entry.date_key !== today), record]);
      await cacheAttendanceRecord(record);
      await enqueueTeacherMutation({ type: "setAttendance", studentId, period, dateKey: today, absent });
      const cache = await loadTeacherOfflineCache();
      setPendingCount(cache.queue.length);
      setSyncStatus("تم تسجيل الغياب محلياً بانتظار المزامنة");
      await attemptSync();
    } catch (error) {
      Alert.alert("تعذر حفظ الغياب محلياً", error instanceof Error ? error.message : "حاول مجدداً");
    }
  };

  const attendanceByStudent = useMemo(() => new Map(attendance.filter((entry) => entry.date_key === today).map((entry) => [entry.student_id, entry])), [attendance, today]);
  const arranged = useMemo(() => arrangeSessionStudents(students, readyStudentIds, attendanceByStudent, searchQuery, readyOnly), [attendanceByStudent, readyOnly, readyStudentIds, searchQuery, students]);
  const listItems = useMemo<StudentListItem[]>(() => [
    ...(arranged.ready.length ? [{ kind: "section" as const, id: "ready", title: "الطلبة المستعدون للتسميع", count: arranged.ready.length }] : []),
    ...arranged.ready.map((student) => ({ kind: "student" as const, id: `ready-${student.id}`, student, tone: attendanceTone(attendanceByStudent.get(student.id)) })),
    ...(!readyOnly && arranged.others.length && arranged.ready.length ? [{ kind: "section" as const, id: "others", title: "بقية الطلبة", count: arranged.others.length }] : []),
    ...(!readyOnly ? arranged.others.map((student) => ({ kind: "student" as const, id: `student-${student.id}`, student, tone: attendanceTone(attendanceByStudent.get(student.id)) })) : []),
  ], [arranged, attendanceByStudent, readyOnly]);

  const unreadNotifications = useMemo(() => messages
    .filter((message) => message.sender_role === "parent" && !message.read_at)
    .map((message) => ({ message, student: students.find((student) => student.id === message.student_id) }))
    .filter((item): item is { message: SchoolMessage; student: SchoolStudent } => Boolean(item.student)), [messages, students]);

  const toggleReady = (studentId: string) => setReadyStudentIds((current) => {
    const next = new Set(current);
    if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
    return next;
  });

  const openUnreadMessage = async (studentId: string) => {
    const readAt = new Date().toISOString();
    const messagesToMark = messages.filter((message) => message.student_id === studentId && message.sender_role === "parent" && !message.read_at);
    setMessages((current) => current.map((message) => messagesToMark.some((candidate) => candidate.id === message.id) ? { ...message, read_at: readAt } : message));
    setNotificationsVisible(false);
    try {
      for (const message of messagesToMark) await cacheTeacherMessage({ ...message, read_at: readAt });
      await enqueueTeacherMutation({ type: "markMessagesRead", studentId });
      const cache = await loadTeacherOfflineCache();
      setPendingCount(cache.queue.length);
      setSyncStatus("تمت قراءة رسالة ولي الأمر محلياً");
      void attemptSync();
    } catch {
      Alert.alert("تعذر حفظ حالة القراءة", "سيفتح ملف الطالب، لكن حاول المزامنة لاحقاً.");
    }
    router.push({ pathname: "/teacher/cloud-student", params: { id: studentId } });
  };

  const openNewsComposer = () => {
    const latest = news[0];
    setEditingNewsId(latest?.id ?? null);
    setNewsText(latest?.content ?? "");
    setNewsVisible(true);
  };

  const saveNews = async () => {
    if (!token || !newsText.trim()) return;
    setBusy(true);
    try {
      const result = editingNewsId
        ? await supabaseSchool.updateTeacherNews(token, editingNewsId, newsText.trim())
        : await supabaseSchool.createTeacherNews(token, newsText.trim());
      setNews([result.news]);
      setNewsVisible(false);
      setSyncStatus(editingNewsId ? "تم تعديل الخبر لجميع أولياء الأمور" : "تم نشر الخبر لجميع أولياء الأمور");
    } catch (error) {
      Alert.alert("تعذر حفظ الخبر", error instanceof Error ? error.message : "تحقق من الاتصال ثم حاول مجدداً.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try { await clearCloudTeacherSession(); }
    finally {
      setToken(null); setStudents([]); setAttendance([]); setMessages([]); setPendingCount(0); setSyncStatus("سجّل الدخول للبدء"); setReadyStudentIds(new Set()); setReadyOnly(false); setSearchQuery("");
      router.replace("/");
    }
  };

  const renderStudent = (student: SchoolStudent, tone: AttendanceTone) => {
    const ready = readyStudentIds.has(student.id);
    const cardStyle = tone === "fullAbsent" ? { ...styles.card, ...styles.cardFullAbsent } : tone === "partialAbsent" ? { ...styles.card, ...styles.cardPartialAbsent } : styles.card;
    const titleStyle = tone === "fullAbsent" ? { ...styles.name, ...styles.darkText } : styles.name;
    const subtitleStyle = tone === "fullAbsent" ? { ...uiStyles.pageSubtitle, ...styles.darkSubtitle } : uiStyles.pageSubtitle;
    return <Surface style={cardStyle}><View style={styles.cardTop}><Pressable style={styles.studentInfo} onPress={() => router.push({ pathname: "/teacher/cloud-student", params: { id: student.id } })}><View style={styles.titleRow}>{ready ? <View style={styles.readyBadge}><AppIcon name="record-voice-over" color={colors.white} size={15} /><Text style={styles.readyBadgeText}>مستعد الآن</Text></View> : null}<Text style={titleStyle}>{student.name}</Text></View><Text style={subtitleStyle}>{student.age} سنة · افتح السبورة</Text></Pressable><View style={styles.readyControl}><Text style={tone === "fullAbsent" ? styles.darkReadyLabel : styles.readyLabel}>مستعد للتسميع</Text><Switch value={ready} onValueChange={() => toggleReady(student.id)} trackColor={{ false: colors.line, true: colors.green }} thumbColor={colors.white} accessibilityLabel={`تبديل حالة ${student.name} مستعد للتسميع`} /></View></View><View style={styles.actions}><SecondaryButton label={attendanceByStudent.get(student.id)?.morning_absent ? "إلغاء صباح" : "غياب صباح"} onPress={() => void toggleAttendance(student.id, "morning")} /><SecondaryButton label={attendanceByStudent.get(student.id)?.evening_absent ? "إلغاء مساء" : "غياب مساء"} onPress={() => void toggleAttendance(student.id, "evening")} /></View></Surface>;
  };

  if (loading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ فتح ملف المعلم المحلي…</Text></ScreenContainer>;
  if (!token) return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gate}><AppIcon name="lock" color={colors.green} size={42} /><Text style={uiStyles.pageTitle}>دخول المعلم</Text><Text style={uiStyles.pageSubtitle}>تحتاج قائمة الطلاب إلى إدخال رمز المعلم.</Text><PrimaryButton label="الذهاب إلى شاشة الرمز" icon="login" onPress={() => router.replace("/teacher/login")} /><Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={styles.switchLink}><AppIcon name="family-restroom" color={colors.gold} size={17} /><Text style={styles.switchLinkText}>دخول ولي الأمر</Text></Pressable></ScreenContainer>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.page}>
    <FlatList
      data={listItems}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={busy || syncing} onRefresh={() => void refresh()} tintColor={colors.green} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.headerRow}><View style={styles.headerCopy}><Text style={uiStyles.pageTitle}>طلابي</Text><Text style={uiStyles.pageSubtitle}>ترتيب جلسة الحلقة لا يُحفظ بعد إغلاق التطبيق.</Text></View><Pressable accessibilityLabel="تسجيل الخروج" onPress={() => void logout()} style={styles.logoutButton}><AppIcon name="logout" color={colors.rose} size={19} /><Text style={styles.logoutText}>خروج</Text></Pressable></View><View style={styles.headerActions}><Pressable accessibilityLabel="نشر خبر جديد أو تعديل خبر" onPress={openNewsComposer} style={styles.newsButton}><AppIcon name="campaign" color={colors.gold} size={19} /><Text style={styles.newsButtonText}>خبر</Text></Pressable><Pressable accessibilityLabel="تحديث البيانات من السحابة" disabled={syncing} onPress={() => void refresh()} style={styles.refreshButton}><AppIcon name="refresh" color={colors.green} size={19} /><Text style={styles.refreshButtonText}>{syncing ? "جارٍ التحديث" : "تحديث"}</Text></Pressable><Pressable accessibilityLabel="تنبيهات رسائل أولياء الأمور" onPress={() => setNotificationsVisible(true)} style={styles.icon}><AppIcon name="notifications" color={unreadNotifications.length ? colors.rose : colors.green} />{unreadNotifications.length ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}</Text></View> : null}</Pressable></View>
        <Surface style={online ? styles.syncCard : { ...styles.syncCard, ...styles.syncCardOffline }}><AppIcon name={online ? "cloud-done" : "cloud-off"} color={online ? colors.green : colors.rose} size={18} /><View style={styles.syncCopy}><Text style={styles.syncTitle}>{online ? "متصل" : "دون اتصال"}</Text><Text style={styles.syncText}>{syncStatus}</Text></View>{online && pendingCount > 0 ? <Pressable onPress={() => void refresh()} style={styles.syncAction}><Text style={styles.syncActionText}>مزامنة</Text></Pressable> : null}</Surface>
        <View style={styles.searchWrap}><AppIcon name="search" color={colors.muted} size={21} /><TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="ابحث بالاسم الأول أو العائلة…" placeholderTextColor={colors.muted} textAlign="right" returnKeyType="search" style={styles.searchInput} />{searchQuery ? <Pressable accessibilityLabel="مسح البحث" onPress={() => setSearchQuery("")} style={styles.clearSearch}><AppIcon name="close" color={colors.muted} size={18} /></Pressable> : null}</View>
        <View style={styles.chips}><Pressable onPress={() => setReadyOnly((current) => !current)} style={readyOnly ? styles.chipActive : styles.chip}><AppIcon name="record-voice-over" color={readyOnly ? colors.white : colors.green} size={17} /><Text style={readyOnly ? styles.chipTextActive : styles.chipText}>المستعدون فقط{readyStudentIds.size ? ` (${readyStudentIds.size})` : ""}</Text></Pressable>{searchQuery ? <Text style={styles.resultsText}>{listItems.filter((item) => item.kind === "student").length} نتيجة</Text> : null}</View>
        <PrimaryButton label="إضافة طالب" icon="person-add" onPress={() => setFormVisible(true)} />
      </View>}
      renderItem={({ item }) => item.kind === "section" ? <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{item.title}</Text><Text style={styles.sectionCount}>{item.count}</Text></View> : renderStudent(item.student, item.tone)}
      ListEmptyComponent={<Surface style={styles.empty}><AppIcon name={readyOnly ? "record-voice-over" : "search"} color={colors.muted} size={28} /><Text style={uiStyles.pageSubtitle}>{readyOnly ? "لا يوجد طالب مستعد للتسميع في هذه الجلسة." : searchQuery ? "لا توجد نتائج مطابقة للاسم." : online ? "القائمة فارغة. أضف أول طالب." : "لا توجد قائمة محفوظة على الجهاز بعد. اتصل بالإنترنت مرة واحدة لتحميلها."}</Text></Surface>}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
    <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}><View style={styles.overlay}><View style={styles.sheet}><Text style={uiStyles.pageTitle}>إضافة طالب</Text><Text style={uiStyles.pageSubtitle}>سيُحفظ الطالب على الجهاز أولاً، ثم يُرفع تلقائياً عند عودة الاتصال.</Text><FormField label="الاسم" value={name} onChangeText={setName} /><FormField label="العمر" value={age} onChangeText={setAge} keyboardType="number-pad" /><FormField label="رمز ولي الأمر" value={parentPin} onChangeText={setParentPin} secureTextEntry /><PrimaryButton label={busy ? "جارٍ الحفظ…" : "حفظ"} disabled={busy} onPress={addStudent} /><SecondaryButton label="إلغاء" onPress={() => setFormVisible(false)} /></View></View></Modal>
    <Modal visible={notificationsVisible} transparent animationType="fade" onRequestClose={() => setNotificationsVisible(false)}><View style={styles.notificationOverlay}><View style={styles.notificationSheet}><View style={styles.notificationHeader}><Text style={styles.notificationTitle}>تنبيهات أولياء الأمور</Text><Pressable accessibilityLabel="إغلاق التنبيهات" onPress={() => setNotificationsVisible(false)} style={styles.notificationClose}><AppIcon name="close" color={colors.muted} size={20} /></Pressable></View>{unreadNotifications.length ? unreadNotifications.map(({ message, student }) => <Pressable key={message.id} onPress={() => void openUnreadMessage(student.id)} style={({ pressed }) => [styles.notificationItem, pressed && styles.pressed]}><View style={styles.notificationIcon}><AppIcon name="mail" color={colors.rose} size={20} /></View><View style={styles.notificationCopy}><Text style={styles.notificationStudent}>{student.name}</Text><Text numberOfLines={2} style={styles.notificationSummary}>{message.content}</Text></View><AppIcon name="chevron-left" color={colors.muted} size={20} /></Pressable>) : <View style={styles.noNotifications}><AppIcon name="notifications-none" color={colors.muted} size={32} /><Text style={uiStyles.pageSubtitle}>لا توجد رسائل جديدة من أولياء الأمور.</Text></View>}</View></View></Modal>
    <Modal visible={newsVisible} transparent animationType="slide" onRequestClose={() => setNewsVisible(false)}><View style={styles.overlay}><View style={styles.sheet}><View style={styles.sheetHead}><Text style={uiStyles.pageTitle}>{editingNewsId ? "تعديل خبر الحلقة" : "خبر الحلقة"}</Text><Pressable accessibilityLabel="إغلاق نافذة الأخبار" onPress={() => setNewsVisible(false)} style={styles.close}><AppIcon name="close" /></Pressable></View><Text style={uiStyles.pageSubtitle}>يوجد خبر واحد فقط للحلقة. يبقى النص هنا ويمكنك تعديله في أي وقت، حتى لو كان طويلاً.</Text><TextInput value={newsText} onChangeText={setNewsText} maxLength={800} multiline textAlign="right" placeholder="اكتب خبر الحلقة هنا…" placeholderTextColor={colors.muted} style={styles.newsInput} /><PrimaryButton label={busy ? "جارٍ الحفظ…" : editingNewsId ? "حفظ التعديل" : "حفظ الخبر"} icon="campaign" disabled={busy || !newsText.trim()} onPress={() => void saveNews()} /></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.paper }, gate: { alignItems: "center", backgroundColor: colors.paper, gap: 16, justifyContent: "center", padding: 24 }, switchLink: { alignItems: "center", flexDirection: "row-reverse", gap: 5, padding: 6 }, switchLinkText: { color: colors.gold, fontSize: 13, fontWeight: "900", textDecorationLine: "underline", writingDirection: "rtl" }, list: { flexGrow: 1, padding: 16 }, header: { gap: 14, marginBottom: 18 }, headerRow: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, headerCopy: { flex: 1, paddingLeft: 10 }, headerActions: { alignItems: "center", flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }, icon: { backgroundColor: colors.white, borderRadius: 13, padding: 11, position: "relative" }, logoutButton: { alignItems: "center", backgroundColor: "#FFF0F0", borderColor: colors.rose, borderRadius: 13, borderWidth: 1, flexDirection: "row-reverse", gap: 4, paddingHorizontal: 10, paddingVertical: 10 }, logoutText: { color: colors.rose, fontSize: 11, fontWeight: "900", writingDirection: "rtl" }, newsButton: { alignItems: "center", backgroundColor: colors.paleGold, borderColor: colors.gold, borderRadius: 13, borderWidth: 1, flexDirection: "row-reverse", gap: 4, paddingHorizontal: 9, paddingVertical: 10 }, newsButtonText: { color: "#80601D", fontSize: 11, fontWeight: "900", writingDirection: "rtl" }, refreshButton: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.green, borderRadius: 13, borderWidth: 1, flexDirection: "row-reverse", gap: 4, paddingHorizontal: 9, paddingVertical: 10 }, refreshButtonText: { color: colors.green, fontSize: 11, fontWeight: "900", writingDirection: "rtl" }, notificationBadge: { alignItems: "center", backgroundColor: colors.rose, borderColor: colors.white, borderRadius: 11, borderWidth: 2, height: 22, justifyContent: "center", position: "absolute", right: -5, top: -5, minWidth: 22 }, notificationBadgeText: { color: colors.white, fontSize: 10, fontWeight: "900" }, syncCard: { alignItems: "center", backgroundColor: colors.paleGreen, flexDirection: "row-reverse", gap: 9, padding: 12 }, syncCardOffline: { backgroundColor: "#FFF1F0" }, syncCopy: { flex: 1 }, syncTitle: { color: colors.ink, fontSize: 13, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, syncText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "right", writingDirection: "rtl" }, syncAction: { backgroundColor: colors.green, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }, syncActionText: { color: colors.white, fontSize: 11, fontWeight: "800" }, searchWrap: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 14, borderWidth: 1, flexDirection: "row-reverse", minHeight: 52, paddingHorizontal: 13 }, searchInput: { color: colors.ink, flex: 1, fontSize: 15, paddingHorizontal: 8, textAlign: "right", writingDirection: "rtl" }, clearSearch: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 14, height: 28, justifyContent: "center", width: 28 }, chips: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, chip: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.green, borderRadius: 18, borderWidth: 1, flexDirection: "row-reverse", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }, chipActive: { alignItems: "center", backgroundColor: colors.green, borderRadius: 18, flexDirection: "row-reverse", gap: 6, paddingHorizontal: 12, paddingVertical: 8 }, chipText: { color: colors.green, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, chipTextActive: { color: colors.white, fontSize: 12, fontWeight: "800", writingDirection: "rtl" }, resultsText: { color: colors.muted, fontSize: 12, writingDirection: "rtl" }, sectionRow: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 2, marginTop: 4, paddingHorizontal: 4 }, sectionTitle: { color: colors.green, fontSize: 15, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, sectionCount: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 12, color: colors.green, fontSize: 11, fontWeight: "900", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3 }, card: { gap: 8, padding: 15 }, cardPartialAbsent: { backgroundColor: "#FFF0F0", borderRightColor: colors.rose, borderRightWidth: 5 }, cardFullAbsent: { backgroundColor: "#3A2E31", borderColor: "#3A2E31", borderRightColor: "#1F1719", borderRightWidth: 5 }, cardTop: { alignItems: "center", flexDirection: "row-reverse", gap: 8, justifyContent: "space-between" }, studentInfo: { flex: 1, gap: 4 }, titleRow: { alignItems: "center", flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 }, name: { color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, darkText: { color: colors.white }, darkSubtitle: { color: "#E9DEDF" }, readyBadge: { alignItems: "center", backgroundColor: colors.green, borderRadius: 11, flexDirection: "row-reverse", gap: 4, paddingHorizontal: 8, paddingVertical: 4 }, readyBadgeText: { color: colors.white, fontSize: 10, fontWeight: "900", writingDirection: "rtl" }, readyControl: { alignItems: "center", gap: 3 }, readyLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", writingDirection: "rtl" }, darkReadyLabel: { color: "#E9DEDF", fontSize: 10, fontWeight: "800", writingDirection: "rtl" }, actions: { flexDirection: "row-reverse", gap: 8, marginTop: 1 }, empty: { alignItems: "center", gap: 10, marginTop: 38, padding: 24 }, separator: { height: 10 }, overlay: { backgroundColor: "rgba(0,0,0,.4)", flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12, padding: 22, paddingBottom: 32 }, sheetHead: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between" }, close: { backgroundColor: colors.white, borderRadius: 12, padding: 8 }, newsInput: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, minHeight: 100, padding: 11, textAlignVertical: "top", writingDirection: "rtl" }, notificationOverlay: { backgroundColor: "rgba(17, 37, 29, .38)", flex: 1, justifyContent: "flex-start", padding: 18, paddingTop: 92 }, notificationSheet: { backgroundColor: colors.paper, borderRadius: 20, gap: 8, maxHeight: "72%", padding: 15 }, notificationHeader: { alignItems: "center", flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 }, notificationTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", writingDirection: "rtl" }, notificationClose: { alignItems: "center", backgroundColor: colors.white, borderRadius: 12, height: 38, justifyContent: "center", width: 38 }, notificationItem: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 14, borderWidth: 1, flexDirection: "row-reverse", gap: 10, minHeight: 70, padding: 10 }, notificationIcon: { alignItems: "center", backgroundColor: "#FFF0F0", borderRadius: 12, height: 38, justifyContent: "center", width: 38 }, notificationCopy: { flex: 1, gap: 3 }, notificationStudent: { color: colors.ink, fontSize: 14, fontWeight: "900", textAlign: "right", writingDirection: "rtl" }, notificationSummary: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "right", writingDirection: "rtl" }, pressed: { opacity: .65 }, noNotifications: { alignItems: "center", gap: 10, paddingVertical: 32 },
});
