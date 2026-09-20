import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { AppIcon, colors, FormField, PrimaryButton, SecondaryButton, Surface, uiStyles } from "@/components/app-ui";
import { AppUpdateBanner } from "@/components/app-update-banner";
import { BoardCanvas } from "@/components/board-canvas";
import { NewsTicker } from "@/components/news-ticker";
import { ScreenContainer } from "@/components/screen-container";
import { checkForAppUpdate } from "@/lib/app-update-service";
import { type AppUpdateInfo } from "@/lib/app-version";
import { clearCloudParentSession, loadCloudParentSession, saveCloudParentSession } from "@/lib/cloud-parent-session";
import { type BoardElement } from "@/lib/app-types";
import { currentMonthKey, monthLabel } from "@/lib/months";
import { prepareNotifications } from "@/lib/notifications";
import { supabaseSchool, type SchoolAttendance, type SchoolBoard, type SchoolMessage, type SchoolNews } from "@/lib/supabase-school-api";

type Snapshot = { student: { id: string; name: string; age: number }; boards: SchoolBoard[]; attendance: SchoolAttendance[]; messages: SchoolMessage[]; news: SchoolNews[] };

export default function CloudParentScreen() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [newsVisible, setNewsVisible] = useState(true);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);

  const checkUpdate = useCallback(async () => {
    try {
      const res = await checkForAppUpdate();
      setAppUpdate(res.hasUpdate ? res.update : null);
    } catch {
      // Non-blocking update check
    }
  }, []);

  const refresh = useCallback(async (token = sessionToken) => {
    if (!token) return;
    const next = await supabaseSchool.parentSnapshot(token);
    setSnapshot(next);
    setConnectionError(null);
    setLastUpdated(new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }));
    void checkUpdate();
  }, [sessionToken, checkUpdate]);

  const registerPushToken = useCallback(async (token: string) => {
    const pushToken = await prepareNotifications();
    if (pushToken) await supabaseSchool.registerParentPushToken(token, pushToken);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const token = await loadCloudParentSession();
        if (!mounted) return;
        setSessionToken(token);
        if (token) {
          try {
            await refresh(token);
            void registerPushToken(token).catch(() => undefined);
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 401) {
              await clearCloudParentSession();
              if (mounted) {
                setSessionToken(null);
                setSnapshot(null);
                setConnectionError("انتهت جلسة ولي الأمر. أدخل الاسم والرمز مرة أخرى.");
              }
            } else if (mounted) {
              setConnectionError("يلزم الاتصال بالإنترنت لعرض سجل الطالب وآخر تحديثاته.");
            }
          }
        }
      } catch (error) {
        if (mounted) setConnectionError(error instanceof Error ? error.message : "تعذر قراءة جلسة الدخول.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refresh, registerPushToken]);

  useEffect(() => {
    if (!sessionToken || !snapshot) return;
    const timer = setInterval(() => { void refresh().catch(() => setConnectionError("تعذر الوصول للسحابة الآن. سيُعاد التحقق تلقائياً.")); }, 60_000);
    return () => clearInterval(timer);
  }, [refresh, sessionToken, snapshot]);

  const login = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const result = await supabaseSchool.parentLogin(name, pin);
      const token = typeof result === "string" ? result : result?.sessionToken;
      if (!token) {
        throw new Error("لم يتم استلام رمز الجلسة من الخادم السحابي");
      }
      await saveCloudParentSession(token);
      setSessionToken(token);
      await refresh(token);
      void registerPushToken(token).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تحقق من الاسم والرمز";
      setErrorMessage(message);
      Alert.alert("تعذر الدخول", message);
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!sessionToken || !message.trim()) return;
    setBusy(true);
    try {
      await supabaseSchool.sendParentMessage(sessionToken, message.trim());
      setMessage("");
      await refresh();
    } catch (error) {
      Alert.alert("تعذر الإرسال", error instanceof Error ? error.message : "تحقق من الاتصال ثم حاول مجدداً");
    } finally { setBusy(false); }
  };

  const manualRefresh = async () => {
    setBusy(true);
    try { await refresh(); }
    catch { setConnectionError("تعذر الوصول للسحابة الآن. تحقق من الاتصال ثم حاول مجدداً."); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    try { await clearCloudParentSession(); }
    finally {
      setSessionToken(null); setSnapshot(null); setConnectionError(null); setLastUpdated(null);
      router.replace("/");
    }
  };
  const confirmLogout = () => setLogoutVisible(true);

  const sortedBoards = useMemo(() => {
    return [...(snapshot?.boards ?? [])].sort((a, b) => b.month_key.localeCompare(a.month_key));
  }, [snapshot?.boards]);

  const activeMonthKey = useMemo(() => {
    if (selectedMonthKey && sortedBoards.some((b) => b.month_key === selectedMonthKey)) {
      return selectedMonthKey;
    }
    return sortedBoards[0]?.month_key ?? currentMonthKey();
  }, [selectedMonthKey, sortedBoards]);

  const selectedBoard = useMemo(() => {
    return sortedBoards.find((b) => b.month_key === activeMonthKey) ?? sortedBoards[0] ?? null;
  }, [sortedBoards, activeMonthKey]);

  const isViewingPreviousMonth = Boolean(selectedBoard && sortedBoards[0] && selectedBoard.month_key !== sortedBoards[0].month_key);

  if (loading) return <ScreenContainer className="items-center justify-center"><Text style={uiStyles.pageSubtitle}>جارٍ التحقق من السجل السحابي…</Text></ScreenContainer>;
  if (sessionToken && !snapshot)
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gateWrapper}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.gateScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.gate}>
              <AppUpdateBanner update={appUpdate} onDismiss={() => setAppUpdate(null)} />
              <AppIcon name="cloud-off" color={colors.rose} size={42} />
              <Text style={uiStyles.pageTitle}>السجل يحتاج إلى اتصال</Text>
              <Text style={[uiStyles.pageSubtitle, styles.center]}>{connectionError ?? "تعذر تحميل السجل من السحابة."}</Text>
              <PrimaryButton
                label="إعادة المحاولة"
                icon="refresh"
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void refresh()
                    .catch(() => setConnectionError("ما زال الاتصال غير متاح."))
                    .finally(() => setBusy(false));
                }}
              />
              <SecondaryButton label="تسجيل الخروج" onPress={confirmLogout} />
              <Pressable onPress={() => router.replace("/teacher/login")}>
                <Text style={styles.switchPortal}>دخول المعلم</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );

  if (!sessionToken || !snapshot)
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.gateWrapper}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.gateScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.gate}>
              <AppUpdateBanner update={appUpdate} onDismiss={() => setAppUpdate(null)} />
              <AppIcon name="cloud-done" color={colors.gold} size={42} />
              <Text style={uiStyles.pageTitle}>بوابة ولي الأمر</Text>
              <Text style={[uiStyles.pageSubtitle, styles.center]}>
                هذه الواجهة سحابية للعرض فقط، وتحتاج اتصالاً بالإنترنت لعرض آخر تحديثات المعلم.
              </Text>
              <FormField
                label="اسم الطالب"
                value={name}
                onChangeText={(value) => {
                  setErrorMessage(null);
                  setName(value);
                }}
              />
              <FormField
                label="الرمز السري"
                value={pin}
                onChangeText={(value) => {
                  setErrorMessage(null);
                  setPin(value);
                }}
                secureTextEntry
              />
              {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
              <PrimaryButton label={busy ? "جارٍ الدخول…" : "دخول"} icon="login" disabled={busy} onPress={login} />
              <Pressable accessibilityRole="button" onPress={() => router.replace("/teacher/login")} style={styles.switchLink}>
                <AppIcon name="auto-stories" color={colors.green} size={17} />
                <Text style={styles.switchPortal}>دخول المعلم</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );

  const attendance = snapshot.attendance.map((item) => ({ dateKey: item.date_key, morningAbsent: item.morning_absent, eveningAbsent: item.evening_absent }));
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.page}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}><View style={styles.header}><View><Text style={uiStyles.pageTitle}>{snapshot.student.name}</Text><Text style={uiStyles.pageSubtitle}>{snapshot.student.age} سنة · عرض سحابي فقط</Text></View><View style={styles.headerActions}><Pressable accessibilityLabel={newsVisible ? "إخفاء شريط الأخبار" : "إظهار شريط الأخبار"} disabled={!snapshot.news.length} onPress={() => setNewsVisible((current) => !current)} style={[styles.tickerToggle, !snapshot.news.length && styles.tickerToggleDisabled]}><AppIcon name={newsVisible ? "visibility-off" : "visibility"} color={newsVisible ? colors.gold : colors.muted} size={19} /><Text style={styles.tickerToggleText}>{newsVisible ? "إخفاء الأخبار" : "إظهار الأخبار"}</Text></Pressable><Pressable accessibilityLabel="تحديث السجل من السحابة" disabled={busy} onPress={() => void manualRefresh()} style={styles.refreshButton}><AppIcon name="refresh" color={colors.green} size={19} /><Text style={styles.refreshButtonText}>{busy ? "جارٍ التحديث" : "تحديث"}</Text></Pressable><Pressable accessibilityLabel="تسجيل الخروج" onPress={confirmLogout} style={styles.icon}><AppIcon name="logout" color={colors.rose} /></Pressable></View></View><AppUpdateBanner update={appUpdate} onDismiss={() => setAppUpdate(null)} /><Surface style={styles.updateCard}><AppIcon name={connectionError ? "cloud-off" : "cloud-done"} color={connectionError ? colors.rose : colors.green} size={18} /><View style={styles.updateCopy}><Text style={styles.updateTitle}>{connectionError ? "بانتظار عودة الاتصال" : "يتحقق من تحديثات المعلم تلقائياً كل دقيقة"}</Text><Text style={styles.updateText}>{connectionError ?? (lastUpdated ? `آخر تحديث: ${lastUpdated}` : "متصل بالسحابة")}</Text></View></Surface><Surface style={styles.boardCard}><View style={styles.boardCardHeader}><View style={styles.boardCardTitles}><Text style={styles.section}>السبورة وسجل الحفظ</Text>{selectedBoard ? <Text style={styles.boardCardSubtitle}>{selectedBoard.label || monthLabel(selectedBoard.month_key)}</Text> : null}</View>{sortedBoards.length > 1 ? <View style={styles.boardCountBadge}><AppIcon name="history" color={colors.green} size={14} /><Text style={styles.boardCountText}>{sortedBoards.length} أشهر متوفرة</Text></View> : null}</View>{sortedBoards.length > 1 ? <View style={styles.monthsSection}><Text style={styles.monthsSectionTitle}>سجل الأشهر السابقة:</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthsScroll}>{sortedBoards.map((b, index) => { const isSelected = b.month_key === activeMonthKey; const isLatest = index === 0; const label = b.label || monthLabel(b.month_key); return <Pressable key={b.month_key} accessibilityRole="button" accessibilityLabel={`عرض سبورة شهر ${label}`} onPress={() => setSelectedMonthKey(b.month_key)} style={[styles.monthChip, isSelected && styles.monthChipActive]}><AppIcon name={isSelected ? "event-available" : "calendar-today"} color={isSelected ? colors.white : colors.green} size={15} /><Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>{label}</Text>{isLatest ? <View style={[styles.latestPill, isSelected && styles.latestPillActive]}><Text style={[styles.latestPillText, isSelected && styles.latestPillTextActive]}>الشهر الحالي</Text></View> : null}</Pressable>; })}</ScrollView></View> : null}{isViewingPreviousMonth && selectedBoard ? <View style={styles.archiveNotice}><View style={styles.archiveNoticeInfo}><AppIcon name="history" color="#80601D" size={16} /><Text style={styles.archiveNoticeText}>أنت تستعرض أرشيف شهر {selectedBoard.label || monthLabel(selectedBoard.month_key)}</Text></View><Pressable accessibilityRole="button" onPress={() => setSelectedMonthKey(sortedBoards[0]?.month_key ?? null)} style={styles.returnToLatestBtn}><Text style={styles.returnToLatestText}>العودة للشهر الحالي</Text><AppIcon name="arrow-back" color={colors.green} size={14} /></Pressable></View> : null}{selectedBoard ? <BoardCanvas key={`${selectedBoard.id}-${selectedBoard.updated_at ?? JSON.stringify(selectedBoard.elements)}`} boardKey={selectedBoard.month_key} initialElements={selectedBoard.elements as BoardElement[]} initialCanvasHeight={selectedBoard.canvas_height} initialThemeKey={selectedBoard.theme_key} initialThemeColors={selectedBoard.theme as never} attendanceRecords={attendance} editable={false} /> : <Text style={uiStyles.pageSubtitle}>لم يضف المعلم سبورة لهذا الطالب بعد.</Text>}</Surface><Surface style={styles.messageCard}><Text style={styles.section}>مراسلة المعلم</Text>{snapshot.messages.slice(-6).map((item) => <View key={item.id} style={[styles.message, item.sender_role === "teacher" ? styles.teacher : styles.parent]}><Text style={styles.role}>{item.sender_role === "teacher" ? "المعلم" : "ولي الأمر"}</Text><Text style={styles.messageText}>{item.content}</Text></View>)}<TextInput value={message} onChangeText={setMessage} multiline textAlign="right" placeholder="اكتب رسالتك للمعلم…" placeholderTextColor={colors.muted} style={styles.input} /><PrimaryButton label={busy ? "جارٍ الإرسال…" : "إرسال"} icon="send" disabled={busy || !message.trim()} onPress={send} /></Surface></ScrollView><NewsTicker news={snapshot.news} visible={newsVisible} /><Modal visible={logoutVisible} transparent animationType="fade" onRequestClose={() => setLogoutVisible(false)}><View style={styles.logoutOverlay}><Surface style={styles.logoutSheet}><AppIcon name="logout" color={colors.rose} size={30} /><Text style={styles.logoutTitle}>تسجيل الخروج</Text><Text style={[uiStyles.pageSubtitle, styles.center]}>هل تريد تسجيل الخروج من بوابة ولي الأمر؟</Text><View style={styles.logoutActions}><SecondaryButton label="إلغاء" onPress={() => setLogoutVisible(false)} /><PrimaryButton label="تسجيل الخروج" icon="logout" onPress={() => { setLogoutVisible(false); void logout(); }} /></View></Surface></View></Modal></ScreenContainer>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.paper },
  gateWrapper: { backgroundColor: colors.paper, flex: 1 },
  keyboardView: { flex: 1 },
  gateScroll: { flexGrow: 1, justifyContent: "center" },
  gate: { alignItems: "center", backgroundColor: colors.paper, gap: 16, justifyContent: "center", padding: 24 },
  center: { textAlign: "center" },
  switchLink: { alignItems: "center", flexDirection: "row", gap: 5, padding: 6 },
  switchPortal: { color: colors.green, fontSize: 13, fontWeight: "900", textDecorationLine: "underline", writingDirection: "rtl" },
  error: { color: colors.rose, fontSize: 13, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  scroll: { flex: 1 },
  content: { gap: 16, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 20 },
  tickerToggle: { alignItems: "center", backgroundColor: colors.paleGold, borderColor: colors.gold, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 10 },
  tickerToggleDisabled: { opacity: .5 },
  tickerToggleText: { color: "#80601D", fontSize: 10, fontWeight: "900", writingDirection: "rtl" },
  logoutOverlay: { alignItems: "center", backgroundColor: "rgba(0,0,0,.42)", flex: 1, justifyContent: "center", padding: 24 },
  logoutSheet: { alignItems: "center", gap: 12, padding: 22, width: "100%" },
  logoutTitle: { color: colors.ink, fontSize: 19, fontWeight: "900", writingDirection: "rtl" },
  logoutActions: { flexDirection: "row", gap: 10, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headerActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  icon: { backgroundColor: colors.white, borderRadius: 13, padding: 11 },
  refreshButton: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.green, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 10 },
  refreshButtonText: { color: colors.green, fontSize: 11, fontWeight: "900", writingDirection: "rtl" },
  updateCard: { alignItems: "center", backgroundColor: colors.paleGreen, flexDirection: "row", gap: 9, padding: 12 },
  updateCopy: { flex: 1 },
  updateTitle: { color: colors.ink, fontSize: 12, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  updateText: { color: colors.muted, fontSize: 11, marginTop: 2, textAlign: "right", writingDirection: "rtl" },
  boardCard: { gap: 12, paddingHorizontal: 6, paddingVertical: 12 },
  boardCardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  boardCardTitles: { gap: 2 },
  boardCardSubtitle: { color: colors.green, fontSize: 13, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  boardCountBadge: { alignItems: "center", backgroundColor: colors.paleGreen, borderRadius: 12, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  boardCountText: { color: colors.green, fontSize: 11, fontWeight: "800", writingDirection: "rtl" },
  monthsSection: { gap: 6, paddingHorizontal: 4 },
  monthsSectionTitle: { color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  monthsScroll: { alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 4 },
  monthChip: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.line, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 38, paddingHorizontal: 12, paddingVertical: 6 },
  monthChipActive: { backgroundColor: colors.green, borderColor: colors.green },
  monthChipText: { color: colors.ink, fontSize: 13, fontWeight: "800", writingDirection: "rtl" },
  monthChipTextActive: { color: colors.white, fontWeight: "900" },
  latestPill: { backgroundColor: colors.paleGreen, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  latestPillActive: { backgroundColor: "#11513E" },
  latestPillText: { color: colors.green, fontSize: 10, fontWeight: "900", writingDirection: "rtl" },
  latestPillTextActive: { color: colors.white },
  archiveNotice: { alignItems: "center", backgroundColor: colors.paleGold, borderColor: colors.gold, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, justifyContent: "space-between", marginHorizontal: 4, paddingHorizontal: 12, paddingVertical: 9 },
  archiveNoticeInfo: { alignItems: "center", flexDirection: "row", flex: 1, gap: 6 },
  archiveNoticeText: { color: "#80601D", fontSize: 12, fontWeight: "800", writingDirection: "rtl" },
  returnToLatestBtn: { alignItems: "center", backgroundColor: colors.white, borderColor: colors.green, borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 5 },
  returnToLatestText: { color: colors.green, fontSize: 11, fontWeight: "900", writingDirection: "rtl" },
  section: { color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  messageCard: { gap: 10, padding: 14 },
  message: { borderRadius: 12, gap: 3, padding: 10 },
  teacher: { backgroundColor: colors.paleGreen },
  parent: { backgroundColor: colors.paleGold },
  role: { color: colors.green, fontSize: 11, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  messageText: { color: colors.ink, textAlign: "right", writingDirection: "rtl" },
  input: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, color: colors.ink, minHeight: 82, padding: 10, textAlign: "right", writingDirection: "rtl" },
});
