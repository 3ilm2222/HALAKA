import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon, colors } from "@/components/app-ui";
import { ARABIC_ALPHABET } from "@/lib/student-session-list";

interface AlphabetBarProps {
  countsByLetter: Record<string, number>;
  selectedLetter: string | null;
  onSelectLetter: (letter: string) => void;
  onResetToTop?: () => void;
}

export function AlphabetBar({
  countsByLetter,
  selectedLetter,
  onSelectLetter,
  onResetToTop,
}: AlphabetBarProps) {
  const totalLettersWithStudents = Object.values(countsByLetter).filter((c) => c > 0).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <AppIcon name="sort-by-alpha" color={colors.green} size={16} />
          <Text style={styles.title}>فهرس الحروف</Text>
          {totalLettersWithStudents > 0 ? (
            <Text style={styles.letterCountHint}>({totalLettersWithStudents} حرف متوفر)</Text>
          ) : null}
        </View>
        {onResetToTop ? (
          <Pressable
            accessibilityLabel="الانتقال لأول القائمة"
            accessibilityRole="button"
            onPress={onResetToTop}
            style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]}
          >
            <AppIcon name="vertical-align-top" color={colors.muted} size={14} />
            <Text style={styles.resetButtonText}>الأعلى</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {ARABIC_ALPHABET.map((letter) => {
          const count = countsByLetter[letter] ?? 0;
          const hasStudents = count > 0;
          const isSelected = selectedLetter === letter;

          return (
            <Pressable
              key={letter}
              accessibilityLabel={`حرف ${letter}${hasStudents ? `، يوجد ${count} طلاب` : "، لا يوجد طلاب"}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasStudents, selected: isSelected }}
              disabled={!hasStudents}
              onPress={() => onSelectLetter(letter)}
              style={({ pressed }) => [
                styles.letterButton,
                hasStudents ? styles.letterButtonActive : styles.letterButtonDisabled,
                isSelected ? styles.letterButtonSelected : null,
                pressed && hasStudents ? styles.letterButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.letterText,
                  hasStudents ? styles.letterTextActive : styles.letterTextDisabled,
                  isSelected ? styles.letterTextSelected : null,
                ]}
              >
                {letter}
              </Text>
              {hasStudents && count > 1 ? (
                <View style={[styles.badge, isSelected ? styles.badgeSelected : null]}>
                  <Text style={[styles.badgeText, isSelected ? styles.badgeTextSelected : null]}>
                    {count > 9 ? "9+" : count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  title: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  letterCountHint: {
    color: colors.muted,
    fontSize: 11,
    writingDirection: "rtl",
  },
  resetButton: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  resetButtonPressed: {
    backgroundColor: colors.paleGreen,
  },
  resetButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    writingDirection: "rtl",
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  letterButton: {
    alignItems: "center",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    position: "relative",
    width: 34,
  },
  letterButtonActive: {
    backgroundColor: colors.paleGreen,
    borderColor: colors.green,
    borderWidth: 1,
  },
  letterButtonSelected: {
    backgroundColor: colors.green,
    borderColor: colors.gold,
    borderWidth: 2,
  },
  letterButtonDisabled: {
    backgroundColor: "transparent",
    opacity: 0.3,
  },
  letterButtonPressed: {
    backgroundColor: colors.green,
    transform: [{ scale: 0.95 }],
  },
  letterText: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  letterTextActive: {
    color: colors.green,
  },
  letterTextSelected: {
    color: colors.white,
  },
  letterTextDisabled: {
    color: colors.muted,
  },
  badge: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 8,
    height: 14,
    justifyContent: "center",
    minWidth: 14,
    paddingHorizontal: 2,
    position: "absolute",
    right: -3,
    top: -3,
  },
  badgeSelected: {
    backgroundColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "900",
  },
  badgeTextSelected: {
    color: colors.green,
  },
});
