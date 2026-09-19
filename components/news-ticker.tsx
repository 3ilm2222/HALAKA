import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon, colors } from "@/components/app-ui";
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

  const translateX = useRef(new Animated.Value(-9999)).current;
  const webAnimRef = useRef<View | null>(null);

  const content = useMemo(() => {
    const item = news.find(
      (entry) =>
        entry &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
    );
    if (!item) return "";
    return item.content.trim().replace(/\r?\n+/g, "  ·  ");
  }, [news]);

  // Compute travel distance and duration
  const estimatedTextWidth =
    textWidth > 0 ? textWidth : Math.max(380, content.length * 9.5);
  const activeTrackWidth = trackWidth > 0 ? trackWidth : 360;
  const totalDistance = estimatedTextWidth + activeTrackWidth;
  const durationSeconds = Math.max(
    12,
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

  // On Native: Recursive Animated.timing loop
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!content || !trackWidth) return;

    let isMounted = true;
    const currentTextWidth = textWidth > 0 ? textWidth : estimatedTextWidth;
    const startX = -currentTextWidth;
    const endX = trackWidth;
    const distance = currentTextWidth + trackWidth;
    const durationMs = Math.max(
      12000,
      Math.round((distance / READING_SPEED_PX_PER_SEC) * 1000)
    );

    const runNativeLoop = () => {
      if (!isMounted) return;
      translateX.setValue(startX);
      Animated.timing(translateX, {
        toValue: endX,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (isMounted) {
          runNativeLoop();
        }
      });
    };

    runNativeLoop();

    return () => {
      isMounted = false;
      translateX.stopAnimation();
    };
  }, [content, estimatedTextWidth, textWidth, trackWidth, translateX]);

  // On Web: Attach Web Animations API to ensure 100% continuous movement
  // Even if CSS keyframes fail or are overridden by browser settings
  useEffect(() => {
    if (Platform.OS !== "web" || !content) return;

    const node = (webAnimRef.current as unknown as HTMLElement | null) ||
      (typeof document !== "undefined" ? document.getElementById(`${safeId}_wrapper`) : null);

    if (!node || typeof node.animate !== "function") return;

    // Movement: startX = -100% of wrapper width (first word emerges at x = 0)
    // endX = activeTrackWidth (until entire sentence exits on the right)
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

      {/* 1. Scrolling track occupying the space from left up to the controls on the right */}
      <Pressable
        id={`${safeId}_track`}
        accessibilityRole="button"
        accessibilityLabel={
          isPaused
            ? "استئناف حركة شريط الأخبار"
            : "إيقاف مؤقت لحركة شريط الأخبار للقراءة"
        }
        onPress={() => setIsPaused((prev) => !prev)}
        onLayout={(event) => {
          const measured = Math.ceil(event.nativeEvent.layout.width);
          if (measured > 0 && Math.abs(measured - trackWidth) > 2) {
            setTrackWidth(measured);
          }
        }}
        style={[styles.tickerTrack, { right: controlsWidth + 10 }]}
      >
        <Animated.View
          id={`${safeId}_wrapper`}
          ref={webAnimRef}
          style={[
            styles.animatedTextWrapper,
            Platform.OS === "web"
              ? ({
                  // Standard RNW inline animation style
                  animationName: `${safeId}_marquee`,
                  animationDuration: `${durationSeconds}s`,
                  animationTimingFunction: "linear",
                  animationIterationCount: "infinite",
                  animationFillMode: "both",
                  animationPlayState: isPaused ? "paused" : "running",
                } as never)
              : {
                  width: textWidth > 0 ? textWidth : undefined,
                  transform: [{ translateX }],
                },
          ]}
        >
          <Text
            id={`${safeId}_text`}
            onLayout={(event) => {
              const measured = Math.ceil(event.nativeEvent.layout.width);
              if (measured > 0 && Math.abs(measured - textWidth) > 2) {
                setTextWidth(measured);
              }
            }}
            style={styles.tickerText}
          >
            {content}
          </Text>
        </Animated.View>
      </Pressable>

      {/* 2. Title & Edit badges fixed permanently on the FAR RIGHT */}
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
        <View style={styles.tickerLabel}>
          <AppIcon name="campaign" color={colors.white} size={18} />
          <Text style={styles.tickerLabelText}>أخبار الحلقة</Text>
        </View>

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
  controlsRow: {
    alignItems: "center",
    backgroundColor: "#00323C",
    bottom: 0,
    flexDirection: "row-reverse",
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
    flexDirection: "row-reverse",
    gap: 6,
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
    flexDirection: "row-reverse",
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
    direction: "rtl" as never,
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
});
