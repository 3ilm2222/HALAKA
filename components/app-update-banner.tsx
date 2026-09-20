import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";

import { AppIcon, colors } from "@/components/app-ui";
import { normalizeDownloadUrl, type AppUpdateInfo } from "@/lib/app-version";

interface AppUpdateBannerProps {
  update: AppUpdateInfo | null;
  onDismiss?: () => void;
}

export function AppUpdateBanner({ update, onDismiss }: AppUpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [openError, setOpenError] = useState(false);

  if (!update || dismissed || !update.downloadUrl) {
    return null;
  }

  const handleOpenDownload = async () => {
    try {
      setOpenError(false);
      const url = normalizeDownloadUrl(update.downloadUrl);
      if (typeof window !== "undefined") {
        window.open(url, "_blank");
      } else {
        await Linking.openURL(url);
      }
    } catch {
      setOpenError(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <View style={[styles.container, update.isMandatory ? styles.containerMandatory : null]}>
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <View style={[styles.iconWrap, update.isMandatory ? styles.iconWrapMandatory : null]}>
            <AppIcon
              name="system-update"
              color={update.isMandatory ? colors.rose : colors.green}
              size={20}
            />
          </View>
          <View style={styles.textWrap}>
            <View style={styles.badgeRow}>
              <Text style={styles.title}>
                تحديث جديد متوفر (v{update.latestVersionName})
              </Text>
              {update.isMandatory ? (
                <View style={styles.mandatoryBadge}>
                  <Text style={styles.mandatoryBadgeText}>تحديث مهم</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.notes}>
              {update.releaseNotes?.trim() ||
                "يتوفر إصدار أحدث للتطبيق يحتوي على تحسينات في الأداء والتسميع."}
            </Text>
          </View>
        </View>

        {!update.isMandatory ? (
          <Pressable
            accessibilityLabel="إخفاء التنبيه مؤقتاً"
            accessibilityRole="button"
            onPress={handleDismiss}
            style={styles.closeBtn}
          >
            <AppIcon name="close" color={colors.muted} size={17} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          accessibilityLabel={`تحميل التحديث الإصدار ${update.latestVersionName}`}
          accessibilityRole="button"
          onPress={handleOpenDownload}
          style={({ pressed }) => [
            styles.downloadButton,
            update.isMandatory ? styles.downloadButtonMandatory : null,
            pressed ? styles.downloadButtonPressed : null,
          ]}
        >
          <AppIcon name="download" color={colors.white} size={18} />
          <Text style={styles.downloadButtonText}>تحميل التحديث الآن</Text>
          <AppIcon name="open-in-new" color={colors.white} size={14} />
        </Pressable>
      </View>
      {openError ? (
        <Text style={styles.errorNotice}>
          تعذر فتح الرابط تلقائياً. تأكد من اتصال الإنترنت أو انسخ الرابط يدوياً.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F4FAF6",
    borderColor: colors.green,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
    padding: 13,
  },
  containerMandatory: {
    backgroundColor: "#FFF5F5",
    borderColor: colors.rose,
    borderWidth: 1.5,
  },
  topRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleArea: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.paleGreen,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  iconWrapMandatory: {
    backgroundColor: "#FFE5E5",
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  badgeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  title: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  mandatoryBadge: {
    backgroundColor: colors.rose,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  mandatoryBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "800",
  },
  notes: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  closeBtn: {
    padding: 4,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  downloadButton: {
    alignItems: "center",
    backgroundColor: colors.green,
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: "100%",
  },
  downloadButtonMandatory: {
    backgroundColor: colors.rose,
  },
  downloadButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  downloadButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
    writingDirection: "rtl",
  },
  errorNotice: {
    color: colors.rose,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
});
