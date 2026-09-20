import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";

import {
  AppIcon,
  colors,
  FormField,
  PrimaryButton,
  SecondaryButton,
  uiStyles,
} from "@/components/app-ui";
import {
  CURRENT_APP_VERSION,
  CURRENT_BUILD_NUMBER,
  isValidDownloadUrl,
  normalizeDownloadUrl,
  toEnglishDigits,
  type AppUpdateInfo,
} from "@/lib/app-version";
import {
  fetchRemoteAppUpdate,
  publishAppUpdate,
} from "@/lib/app-update-service";

interface AppUpdateManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (update: AppUpdateInfo) => void;
}

export function AppUpdateManagerModal({
  visible,
  onClose,
  onSaved,
}: AppUpdateManagerModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versionName, setVersionName] = useState("1.1.0");
  const [versionCode, setVersionCode] = useState("2");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;

    setStatusMessage(null);
    setConfirmClear(false);
    setLoading(true);

    void (async () => {
      try {
        const current = await fetchRemoteAppUpdate();
        if (!active || !current) return;
        if (current.latestVersionName) setVersionName(current.latestVersionName);
        if (current.latestVersionCode) setVersionCode(String(current.latestVersionCode));
        if (current.downloadUrl) setDownloadUrl(current.downloadUrl);
        if (current.releaseNotes) setReleaseNotes(current.releaseNotes);
        setIsMandatory(Boolean(current.isMandatory));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [visible]);

  const handleSave = async () => {
    setStatusMessage(null);

    const rawUrl = downloadUrl.trim();
    const cleanDigitsVersionName = toEnglishDigits(versionName).trim() || "1.0.0";
    const cleanDigitsVersionCode = parseInt(toEnglishDigits(versionCode), 10) || 1;

    let normalizedUrl = "";
    if (rawUrl) {
      if (!isValidDownloadUrl(rawUrl)) {
        setStatusMessage({
          type: "error",
          text: "الرابط غير صالح. يرجى إدخال رابط يبدأ بـ https:// أو رابط مباشر (Google Drive / MediaFire / APK).",
        });
        return;
      }
      normalizedUrl = normalizeDownloadUrl(rawUrl);
    }

    setSaving(true);
    try {
      const updated = await publishAppUpdate({
        latestVersionName: cleanDigitsVersionName,
        latestVersionCode: cleanDigitsVersionCode,
        downloadUrl: normalizedUrl,
        releaseNotes: releaseNotes.trim(),
        isMandatory,
      });

      // Update local field state to reflect normalized values
      setVersionName(updated.latestVersionName);
      setVersionCode(String(updated.latestVersionCode));
      setDownloadUrl(updated.downloadUrl);

      setStatusMessage({
        type: "success",
        text: updated.downloadUrl
          ? `✓ تم حفظ ونشر التحديث (v${updated.latestVersionName}) بنجاح! سيظهر التنبيه فقط للولي الذي يملك نسخة أقدم.`
          : "✓ تم مسح رابط التحديث. لن يظهر أي تنبيه لأولياء الأمور.",
      });

      onSaved?.(updated);
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "تعذر حفظ التحديث. تحقق من الاتصال.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteClear = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const reset = await publishAppUpdate({
        latestVersionName: CURRENT_APP_VERSION,
        latestVersionCode: CURRENT_BUILD_NUMBER,
        downloadUrl: "",
        releaseNotes: "",
        isMandatory: false,
      });

      setDownloadUrl("");
      setReleaseNotes("");
      setIsMandatory(false);
      setConfirmClear(false);

      setStatusMessage({
        type: "info",
        text: "تم مسح رابط التحديث وإلغاء ظهوره لجميع أولياء الأمور.",
      });

      onSaved?.(reset);
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "تعذر مسح التحديث.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestLink = async () => {
    const raw = downloadUrl.trim();
    if (!raw || !isValidDownloadUrl(raw)) {
      setStatusMessage({
        type: "error",
        text: "أدخل رابطاً صالحاً أولاً لتجربته.",
      });
      return;
    }

    const norm = normalizeDownloadUrl(raw);
    try {
      if (typeof window !== "undefined") {
        window.open(norm, "_blank");
      } else {
        await Linking.openURL(norm);
      }
      setStatusMessage({
        type: "info",
        text: "تم فتح الرابط للتجربة.",
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: "تعذر فتح الرابط. يرجى التأكد من صحة الرابط المدخل.",
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHead}>
            <View style={styles.headTitleRow}>
              <AppIcon name="system-update" color={colors.green} size={22} />
              <Text style={uiStyles.pageTitle}>إدارة تحديث التطبيق</Text>
            </View>
            <Pressable
              accessibilityLabel="إغلاق إدارة التحديث"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <AppIcon name="close" color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Current Installed App Version Badge */}
            <View style={styles.infoBox}>
              <View style={styles.versionBadgeRow}>
                <Text style={styles.infoText}>إصدار التطبيق الحالي المثبت:</Text>
                <View style={styles.versionPill}>
                  <Text style={styles.versionPillText}>
                    v{CURRENT_APP_VERSION} (كود {CURRENT_BUILD_NUMBER})
                  </Text>
                </View>
              </View>
              <Text style={styles.infoHint}>
                المنطق الذكي: سيظهر رابط التحديث للولي فقط إذا كان رقم تطبيقه أقل من الإصدار الذي تحدده بالأسفل. إذا كان تطبيق الولي محدثاً، فلن يظهر له أي شيء.
              </Text>
            </View>

            {/* Dynamic Status Notification Banner */}
            {statusMessage ? (
              <View
                style={[
                  styles.statusBox,
                  statusMessage.type === "error"
                    ? styles.statusBoxError
                    : statusMessage.type === "success"
                    ? styles.statusBoxSuccess
                    : styles.statusBoxInfo,
                ]}
              >
                <AppIcon
                  name={
                    statusMessage.type === "error"
                      ? "error-outline"
                      : statusMessage.type === "success"
                      ? "check-circle"
                      : "info-outline"
                  }
                  color={
                    statusMessage.type === "error"
                      ? colors.rose
                      : statusMessage.type === "success"
                      ? colors.green
                      : colors.gold
                  }
                  size={20}
                />
                <Text
                  style={[
                    styles.statusText,
                    statusMessage.type === "error"
                      ? styles.statusTextError
                      : statusMessage.type === "success"
                      ? styles.statusTextSuccess
                      : styles.statusTextInfo,
                  ]}
                >
                  {statusMessage.text}
                </Text>
              </View>
            ) : null}

            {/* Inputs Form */}
            <View style={styles.formSection}>
              <FormField
                label="رقم الإصدار الجديد (مثال: 1.1.0)"
                value={versionName}
                onChangeText={(val) => {
                  setVersionName(val);
                  setStatusMessage(null);
                }}
                placeholder="1.1.0"
              />

              <FormField
                label="كود البناء الجديد (رقم تسلسلي، مثال: 2)"
                value={versionCode}
                onChangeText={(val) => {
                  setVersionCode(val);
                  setStatusMessage(null);
                }}
                placeholder="2"
                keyboardType="numeric"
              />

              <View style={styles.urlFieldWrap}>
                <FormField
                  label="رابط التحميل المباشر للنسخة الجديدة"
                  value={downloadUrl}
                  onChangeText={(val) => {
                    setDownloadUrl(val);
                    setStatusMessage(null);
                  }}
                  placeholder="https://drive.google.com/... أو رابط APK مباشر"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {downloadUrl.trim() ? (
                  <Pressable
                    accessibilityLabel="تجربة فتح الرابط"
                    accessibilityRole="button"
                    onPress={handleTestLink}
                    style={styles.testLinkBtn}
                  >
                    <AppIcon name="open-in-new" color={colors.green} size={15} />
                    <Text style={styles.testLinkText}>تجربة فتح الرابط في المتصفح</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.textareaWrap}>
                <Text style={styles.fieldLabel}>ملاحظات التحديث للولي (اختياري):</Text>
                <TextInput
                  value={releaseNotes}
                  onChangeText={(val) => {
                    setReleaseNotes(val);
                    setStatusMessage(null);
                  }}
                  placeholder="مثال: إضافة تحسينات لسرعة الحفظ وتحديث شريط التسميع..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  textAlign="right"
                  style={styles.textarea}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>تحديث إلزامي / مهم</Text>
                  <Text style={styles.switchSubtitle}>
                    يظهر كإشعار بارز بلون أحمر للولي لحثه على الترقية
                  </Text>
                </View>
                <Switch
                  value={isMandatory}
                  onValueChange={setIsMandatory}
                  trackColor={{ false: colors.line, true: colors.green }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <PrimaryButton
                label={
                  saving
                    ? "جارٍ الحفظ والتعميم…"
                    : loading
                    ? "جارٍ جلب البيانات…"
                    : "حفظ ونشر التحديث"
                }
                icon="cloud-upload"
                disabled={saving}
                onPress={() => void handleSave()}
              />

              {confirmClear ? (
                <View style={styles.confirmClearBox}>
                  <Text style={styles.confirmClearTitle}>
                    هل أنت متأكد من مسح رابط التحديث وإلغائه؟
                  </Text>
                  <View style={styles.confirmClearRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => void handleExecuteClear()}
                      style={styles.confirmDangerBtn}
                    >
                      <Text style={styles.confirmDangerText}>نعم، الغِ التحديث</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setConfirmClear(false)}
                      style={styles.confirmCancelBtn}
                    >
                      <Text style={styles.confirmCancelText}>تراجع</Text>
                    </Pressable>
                  </View>
                </View>
              ) : downloadUrl.trim() ? (
                <Pressable
                  accessibilityLabel="مسح رابط التحديث"
                  accessibilityRole="button"
                  onPress={() => setConfirmClear(true)}
                  style={styles.clearBtn}
                >
                  <AppIcon name="delete-outline" color={colors.rose} size={16} />
                  <Text style={styles.clearBtnText}>مسح التحديث وإلغاء ظهوره لأولياء الأمور</Text>
                </Pressable>
              ) : null}

              <SecondaryButton label="إغلاق النافذة" onPress={onClose} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 12,
    maxHeight: "92%",
    padding: 20,
    width: "100%",
  },
  sheetHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  close: {
    padding: 6,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 24,
  },
  infoBox: {
    backgroundColor: colors.paleGreen,
    borderColor: colors.green,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  versionBadgeRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  versionPill: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  versionPillText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "900",
  },
  infoHint: {
    color: "#2C6345",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  statusBox: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  statusBoxError: {
    backgroundColor: "#FFF2F2",
    borderColor: "#F5C2C2",
  },
  statusBoxSuccess: {
    backgroundColor: "#EDF8F2",
    borderColor: "#B7DDC8",
  },
  statusBoxInfo: {
    backgroundColor: colors.paleGold,
    borderColor: "#EAD6AA",
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "right",
    writingDirection: "rtl",
  },
  statusTextError: {
    color: colors.rose,
  },
  statusTextSuccess: {
    color: colors.green,
  },
  statusTextInfo: {
    color: "#80601D",
  },
  formSection: {
    gap: 10,
  },
  urlFieldWrap: {
    gap: 4,
  },
  testLinkBtn: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  testLinkText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "rtl",
  },
  textareaWrap: {
    gap: 6,
  },
  textarea: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 13,
    minHeight: 70,
    padding: 10,
    textAlignVertical: "top",
    writingDirection: "rtl",
  },
  switchRow: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  switchCopy: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "rtl",
  },
  switchSubtitle: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "right",
    writingDirection: "rtl",
  },
  actions: {
    gap: 10,
    marginTop: 6,
  },
  clearBtn: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 8,
  },
  clearBtnText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  confirmClearBox: {
    backgroundColor: "#FFF2F2",
    borderColor: "#F5C2C2",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  confirmClearTitle: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    writingDirection: "rtl",
  },
  confirmClearRow: {
    flexDirection: "row",
    gap: 8,
  },
  confirmDangerBtn: {
    alignItems: "center",
    backgroundColor: colors.rose,
    borderRadius: 10,
    flex: 1,
    paddingVertical: 10,
  },
  confirmDangerText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
    writingDirection: "rtl",
  },
  confirmCancelBtn: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  confirmCancelText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    writingDirection: "rtl",
  },
});
