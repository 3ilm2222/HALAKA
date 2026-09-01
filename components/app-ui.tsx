import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

export const colors = {
  green: "#004754",
  gold: "#C8902F",
  ink: "#21332D",
  muted: "#5D7069",
  paper: "#F8F6F0",
  white: "#FFFFFF",
  line: "#DCE4DE",
  rose: "#A63D40",
  paleGreen: "#E6F1EC",
  paleGold: "#FBF2DF",
};

export function AppIcon({ name, color = colors.green, size = 24 }: { name: React.ComponentProps<typeof MaterialIcons>["name"]; color?: string; size?: number }) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, style, (pressed || disabled) && styles.buttonPressed, disabled && styles.disabled]}
    >
      {icon ? <AppIcon name={icon} color={colors.white} size={20} /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialIcons>["name"];
  danger?: boolean;
}) {
  const tone = danger ? colors.rose : colors.green;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, { borderColor: tone }, pressed && styles.buttonPressed]}>
      {icon ? <AppIcon name={icon} color={tone} size={19} /> : null}
      <Text style={[styles.secondaryButtonText, { color: tone }]}>{label}</Text>
    </Pressable>
  );
}

export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor="#93A19A" textAlign="right" style={styles.input} {...props} />
    </View>
  );
}

export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export const uiStyles = StyleSheet.create({
  pageTitle: { color: colors.ink, fontSize: 28, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  pageSubtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: "right", writingDirection: "rtl" },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", textAlign: "right", writingDirection: "rtl" },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "right", writingDirection: "rtl" },
});

const styles = StyleSheet.create({
  primaryButton: { alignItems: "center", backgroundColor: colors.green, borderRadius: 16, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 52, paddingHorizontal: 18 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800", writingDirection: "rtl" },
  secondaryButton: { alignItems: "center", backgroundColor: colors.white, borderRadius: 14, borderWidth: 1.2, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  secondaryButtonText: { fontSize: 14, fontWeight: "800", writingDirection: "rtl" },
  buttonPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  fieldWrap: { gap: 7 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: "700", textAlign: "right", writingDirection: "rtl" },
  input: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 52, paddingHorizontal: 14, writingDirection: "rtl" },
  surface: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: 20, borderWidth: 1, padding: 16, shadowColor: "#19372B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
});
