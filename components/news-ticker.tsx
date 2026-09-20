import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon, colors, PrimaryButton, SecondaryButton, Surface } from "@/components/app-ui";
import { SchoolNews } from "@/lib/supabase-school-api";

export type NewsTickerProps = {
  news: SchoolNews[];
  visible?: boolean;
  onEditPress?: () => void;
  isTeacher?: boolean;
};

// Calm, natural reading speed for Arabic text (~34 pixels per second)
const READING_SPEED_PX_PER_SEC = 34;

export function NewsTicker({
  news,
  visible = true,
  onEditPress,
  isTeacher = false,
}: NewsTickerProps) {
  const rawId = useId();
  const safeId = useMemo(
    () => `ticker_${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId]
  );

  const [trackWidth, setTrackWidth] = useState(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Math.max(280, window.innerWidth - 180);
    }
    return 360;
  });

  const [controlsWidth, setControlsWidth] = useState(135);
  const [textWidth, setTextWidth] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  const translateX = useRef(new Animated.Value(-9999)).current;
  const webAnimRef = useRef<View | null>(null);

  // Collect all valid news items
  const activeNewsItems = useMemo(() => {
    return news.filter(
      (entry) =>
        entry &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
    );
  }, [news]);

  // Combined ticker string
  const content = useMemo(() => {
    if (!activeNewsItems.length) return "";
    return activeNewsItems
      .map((item) => item.content.trim().replace(/\r?\n+/g, "  ·  "))
      .join("     ✦     ");
  }, [activeNewsItems]);

  // Compute travel distance and duration
  const estimatedTextWidth = useMemo(() => {
    return Math.max(420, Math.ceil(content.length * 13.5));
  }, [content]);

  const activeTrackWidth = trackWidth > 0 ? trackWidth : 360;
  const currentTextWidth = textWidth > 0 ? textWidth : estimatedTextWidth;
  const totalDistance = currentTextWidth + activeTrackWidth;
  const durationSeconds = Math.max(
    10,
    Math.round(totalDistance / READING_SPEED_PX_PER_SEC)
  );

  // Measure rendered text width on Web
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined" && content) {
      const el = document.getElementById(`${safeId}_text`);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) {
          setTextWidth(Math.ceil(rect.width));
        }
      }
    }
  }, [content, safeId]);

  // On Native (Android / iOS): Continuous Animated.timing loop
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!content || !trackWidth || isPaused) return;

    let isMounted = true;
    const measuredWidth = textWidth > 0 ? textWidth : estimatedTextWidth;
    const startX = -measuredWidth;
    const endX = trackWidth;
    const distance = measuredWidth + trackWidth;
    const durationMs = Math.max(
      10000,
      Math.round((distance / READING_SPEED_PX_PER_SEC) * 1000)
    );

    const runNativeLoop = () => {
      if (!isMounted || isPaused) return;
      translateX.setValue(startX);
      Animated.timing(translateX, {
        toValue: endX,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (isMounted && finished && !isPaused) {
          runNativeLoop();
        }
      });
    };

    runNativeLoop();

    return () => {
      isMounted = false;
      translateX.stopAnimation();
    };
  }, [content, estimatedTextWidth, isPaused, textWidth, trackWidth, translateX]);

  // On Web: Web Animations API
  useEffect(() => {
    if (Platform.OS !== "web" || !content) return;

    const node =
      (webAnimRef.current as unknown as HTMLElement | null) ||
      (typeof document !== "undefined"
        ? document.getElementById(`${safeId}_wrapper`)
        : null);

    if (!node || typeof node.animate !== "function") return;

    const animation = node.animate(
      [
        { transform: "translateX(-100%)" },
        { transform: `translateX(${activeTrackWidth}px)` },
      ],
      {
        duration: durationSeconds * 1000,
        iterations: Infinity,
        easing: "linear",
      }
    );

    if (isPaused) {
      animation.pause();
    } else {
      animation.play();
    }

    return () => {
      animation.cancel();
    };
  }, [activeTrackWidth, content, durationSeconds, isPaused, safeId]);

  if (!visible) return null;

  // Empty state for teacher screen
  if (!content) {
    if (!isTeacher) return null;
    return (
      <Pressable
        id={`${safeId}_empty`}
        accessibilityRole="button"
        accessibilityLabel="كتابة خبر جديد للحلقة"
        onPress={onEditPress}
        style={styles.emptyTeacherBanner}
      >
        <View
          style={styles.controlsRow}
          onLayout={(e) =>
            setControlsWidth(Math.ceil(e.nativeEvent.layout.width))
          }
        >
          <View style={styles.tickerLabel}>
            <AppIcon name="campaign" color={colors.white} size={18} />
            <Text style={styles.tickerLabelText}>أخبار الحلقة</Text>
          </View>
          {onEditPress ? (
            <View style={styles.editBadge}>
              <AppIcon name="edit" color={colors.white} size={14} />
              <Text style={styles.editBadgeText}>كتابة</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.emptyPromptText}>
          لا يوجد خبر معروض حالياً · اضغط هنا لكتابة خبر للحلقة
        </Text>
      </Pressable>
    );
  }

  return (
    <>
      <View id={safeId} style={styles.ticker}>
        {/* Declarative CSS Keyframes backup for web rendering */}
        {Platform.OS === "web" ? (
          <style>{`
            @keyframes ${safeId}_marquee {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(${activeTrackWidth}px);
              }
            }
            #${safeId}_wrapper:hover {
              animation-play-state: paused !important;
            }
          `}</style>
        ) : null}

        {/* Hidden off-screen unconstrained measurement view for Android / iOS to measure true text width */}
        {Platform.OS !== "web" ? (
          <View
            style={styles.offscreenMeasurement}
            pointerEvents="none"
            aria-hidden="true"
          >
            <Text
              numberOfLines={1}
              onLayout={(event) => {
                const measured = Math.ceil(event.nativeEvent.layout.width);
                if (measured > 0 && Math.abs(measured - textWidth) > 3) {
                  setTextWidth(measured);
                }
              }}
              style={styles.measurementText}
            >
              {content}
            </Text>
          </View>
        ) : null}

        {/* 1. Scrolling track occupying the space from left up to the controls on the right */}
        <Pressable
          id={`${safeId}_track`}
          accessibilityRole="button"
          accessibilityLabel="اضغط لعرض كامل الخبر وقراءته بوضوح"
          onPress={() => setDetailVisible(true)}
          onLayout={(event) => {
            const measured = Math.ceil(event.nativeEvent.layout.width);
            if (measured > 0 && Math.abs(measured - trackWidth) > 2) {
              setTrackWidth(measured);
            }
          }}
          style={[styles.tickerTrack, { right: controlsWidth + 6 }]}
        >
          <Animated.View
            id={`${safeId}_wrapper`}
            ref={webAnimRef}
            style={[
              styles.animatedTextWrapper,
              Platform.OS === "web"
                ? ({
                    animationName: `${safeId}_marquee`,
                    animationDuration: `${durationSeconds}s`,
                    animationTimingFunction: "linear",
                    animationIterationCount: "infinite",
                    animationFillMode: "both",
                    animationPlayState: isPaused ? "paused" : "running",
                  } as never)
                : {
                    width: currentTextWidth,
                    transform: [{ translateX }],
                  },
            ]}
          >
            <Text
              id={`${safeId}_text`}
              numberOfLines={1}
              ellipsizeMode="clip"
              onLayout={(event) => {
                if (Platform.OS === "web") {
                  const measured = Math.ceil(event.nativeEvent.layout.width);
                  if (measured > 0 && Math.abs(measured - textWidth) > 2) {
                    setTextWidth(measured);
                  }
                }
              }}
              style={[
                styles.tickerText,
                Platform.OS !== "web" && { width: currentTextWidth },
              ]}
            >
              {content}
            </Text>
          </Animated.View>
        </Pressable>

        {/* 2. Title, Reader & Edit badges fixed permanently on the FAR RIGHT */}
        <View
          id={`${safeId}_controls`}
          onLayout={(event) => {
            const measured = Math.ceil(event.nativeEvent.layout.width);
            if (measured > 0 && Math.abs(measured - controlsWidth) > 2) {
              setControlsWidth(measured);
            }
          }}
          style={styles.controlsRow}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="قراءة الخبر كاملاً"
            onPress={() => setDetailVisible(true)}
            style={({ pressed }) => [styles.tickerLabel, pressed && styles.pressed]}
          >
            <AppIcon name="campaign" color={colors.white} size={18} />
            <Text style={styles.tickerLabelText}>أخبار الحلقة</Text>
            <AppIcon name="open-in-full" color="rgba(255,255,255,0.7)" size={13} />
          </Pressable>

          {isTeacher && onEditPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="تعديل خبر الحلقة"
              onPress={onEditPress}
              style={({ pressed }) => [styles.editBadge, pressed && styles.pressed]}
            >
              <AppIcon name="edit" color={colors.white} size={14} />
              <Text style={styles.editBadgeText}>تعديل</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Full News Reader Modal: Allows reading long news in full without waiting for scroll */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconWrap}>
                  <AppIcon name="campaign" color={colors.gold} size={24} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>أخبار وتنبيهات الحلقة</Text>
                  <Text style={styles.modalSubtitle}>
                    {activeNewsItems.length > 1
                      ? `${activeNewsItems.length} أخبار متوفرة`
                      : "خبر الحلقة الحالي"}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="إغلاق"
                onPress={() => setDetailVisible(false)}
                style={styles.modalCloseBtn}
              >
                <AppIcon name="close" color={colors.muted} size={20} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {activeNewsItems.map((item, index) => (
                <View key={item.id || index} style={styles.newsItemBox}>
                  {activeNewsItems.length > 1 && (
                    <View style={styles.newsItemHeader}>
                      <Text style={styles.newsItemIndex}>خبر #{index + 1}</Text>
                      {item.created_at && (
                        <Text style={styles.newsItemDate}>
                          {new Date(item.created_at).toLocaleDateString("ar-SA", {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                      )}
                    </View>
                  )}
                  <Text style={styles.modalBodyText} selectable>
                    {item.content}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <SecondaryButton
                label={isPaused ? "استئناف الحركة" : "إيقاف الحركة"}
                icon={isPaused ? "play-arrow" : "pause"}
                onPress={() => setIsPaused((prev) => !prev)}
              />
              {isTeacher && onEditPress ? (
                <PrimaryButton
                  label="تعديل الخبر"
                  icon="edit"
                  onPress={() => {
                    setDetailVisible(false);
                    onEditPress();
                  }}
                  style={styles.modalEditBtn}
                />
              ) : null}
              <SecondaryButton
                label="إغلاق"
                onPress={() => setDetailVisible(false)}
              />
            </View>
          </Surface>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  ticker: {
    backgroundColor: "#00323C",
    borderTopColor: colors.gold,
    borderTopWidth: 1.5,
    height: 48,
    overflow: "hidden",
    position: "relative",
    width: "100%",
    zIndex: 50,
  },
  offscreenMeasurement: {
    flexDirection: "row",
    left: -9999,
    opacity: 0,
    position: "absolute",
    top: -9999,
  },
  measurementText: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: "800",
    includeFontPadding: false,
    paddingHorizontal: 4,
    textAlign: "right",
    writingDirection: "rtl",
  },
  controlsRow: {
    alignItems: "center",
    backgroundColor: "#00323C",
    bottom: 0,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 8,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 30,
  },
  tickerLabel: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tickerLabelText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "900",
    writingDirection: "rtl",
  },
  editBadge: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 7,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  tickerTrack: {
    bottom: 0,
    justifyContent: "center",
    left: 8,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    zIndex: 10,
  },
  animatedTextWrapper: {
    alignItems: "center",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    top: 0,
    ...Platform.select({
      web: {
        width: "max-content" as never,
        whiteSpace: "nowrap" as never,
        display: "inline-flex" as never,
      },
    }),
  },
  tickerText: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: "800",
    includeFontPadding: false,
    lineHeight: 46,
    paddingHorizontal: 4,
    textAlign: "right",
    writingDirection: "rtl",
    ...Platform.select({
      web: {
        whiteSpace: "nowrap" as never,
        display: "inline-block" as never,
        wordBreak: "keep-all" as never,
      },
      default: {
        flexShrink: 0,
      },
    }),
  },
  emptyTeacherBanner: {
    alignItems: "center",
    backgroundColor: "#00323C",
    borderTopColor: colors.gold,
    borderTopWidth: 1.5,
    height: 48,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  emptyPromptText: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 12,
    fontWeight: "700",
    left: 12,
    position: "absolute",
    right: 150,
    textAlign: "right",
    top: 14,
    writingDirection: "rtl",
  },
  pressed: {
    opacity: 0.8,
  },
  // Modal Reader Styles
  modalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    maxHeight: "80%",
    padding: 20,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 14,
  },
  modalTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  modalIconWrap: {
    alignItems: "center",
    backgroundColor: colors.paleGold,
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
    writingDirection: "rtl",
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  modalCloseBtn: {
    backgroundColor: colors.paper,
    borderRadius: 10,
    padding: 6,
  },
  modalScroll: {
    marginVertical: 12,
  },
  modalScrollContent: {
    gap: 12,
  },
  newsItemBox: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  newsItemHeader: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 6,
  },
  newsItemIndex: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  newsItemDate: {
    color: colors.muted,
    fontSize: 11,
    writingDirection: "rtl",
  },
  modalBodyText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 8,
  },
  modalEditBtn: {
    flex: 1,
  },
});
