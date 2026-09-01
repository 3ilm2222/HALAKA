export type CustomThemeColors = {
  canvas: string;
  accent: string;
  ink: string;
  gold: string;
};

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  canvas: "#FFFDF7",
  accent: "#176B53",
  ink: "#21332D",
  gold: "#C8902F",
};

export const BOARD_THEMES = {
  classic: {
    label: "الأصلي القرآني",
    description: "عاجي هادئ مع أخضر زمردي وذهبي.",
    canvas: "#FFFDF7",
    canvasBorder: "#D9D1BA",
    surface: "#FFFFFF",
    rowBorder: "#BFD4C9",
    accent: "#176B53",
    ink: "#21332D",
    gold: "#C8902F",
    titleSurface: "#FFFDF7",
    fullSurface: "#176B53",
    fullInk: "#FFF8E8",
  },
  sky: {
    label: "سماء هادئة",
    description: "أزرق لطيف مع رمادي فاتح للمتابعة اليومية.",
    canvas: "#F5FAFF",
    canvasBorder: "#B9D8F0",
    surface: "#FFFFFF",
    rowBorder: "#AFCDE2",
    accent: "#1769AA",
    ink: "#18354E",
    gold: "#3C86B8",
    titleSurface: "#EDF7FF",
    fullSurface: "#1769AA",
    fullInk: "#F5FBFF",
  },
  plum: {
    label: "بنفسجي أنيق",
    description: "بنفسجي دافئ ولمسات وردية هادئة.",
    canvas: "#FCF8FF",
    canvasBorder: "#D9C4E9",
    surface: "#FFFFFF",
    rowBorder: "#CEB5DF",
    accent: "#73429B",
    ink: "#372348",
    gold: "#A767A2",
    titleSurface: "#F8F0FD",
    fullSurface: "#73429B",
    fullInk: "#FFF9FF",
  },
  sand: {
    label: "ورق رملي",
    description: "بيج ورملي للكتابة الهادئة والواضحة.",
    canvas: "#FFFCF4",
    canvasBorder: "#E0CCAA",
    surface: "#FFF9EC",
    rowBorder: "#D9BC87",
    accent: "#8A5A23",
    ink: "#4A341E",
    gold: "#B47A32",
    titleSurface: "#FFF4D9",
    fullSurface: "#8A5A23",
    fullInk: "#FFF9E9",
  },
  custom: {
    label: "ألواني الخاصة",
    description: "اختر ألوان الورق والعناوين والنصوص بنفسك.",
    canvas: DEFAULT_CUSTOM_THEME.canvas,
    canvasBorder: DEFAULT_CUSTOM_THEME.accent,
    surface: "#FFFFFF",
    rowBorder: DEFAULT_CUSTOM_THEME.accent,
    accent: DEFAULT_CUSTOM_THEME.accent,
    ink: DEFAULT_CUSTOM_THEME.ink,
    gold: DEFAULT_CUSTOM_THEME.gold,
    titleSurface: DEFAULT_CUSTOM_THEME.canvas,
    fullSurface: DEFAULT_CUSTOM_THEME.accent,
    fullInk: "#FFFFFF",
  },
} as const;

export type BoardThemeKey = keyof typeof BOARD_THEMES;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeCustomTheme(value?: Partial<CustomThemeColors> | null): CustomThemeColors {
  return {
    canvas: isHexColor(value?.canvas) ? value.canvas : DEFAULT_CUSTOM_THEME.canvas,
    accent: isHexColor(value?.accent) ? value.accent : DEFAULT_CUSTOM_THEME.accent,
    ink: isHexColor(value?.ink) ? value.ink : DEFAULT_CUSTOM_THEME.ink,
    gold: isHexColor(value?.gold) ? value.gold : DEFAULT_CUSTOM_THEME.gold,
  };
}

export function getBoardTheme(key?: string, customColors?: Partial<CustomThemeColors> | null) {
  if (key === "custom") {
    const custom = normalizeCustomTheme(customColors);
    return {
      ...BOARD_THEMES.custom,
      canvas: custom.canvas,
      canvasBorder: custom.accent,
      rowBorder: custom.accent,
      accent: custom.accent,
      ink: custom.ink,
      gold: custom.gold,
      titleSurface: custom.canvas,
      fullSurface: custom.accent,
    };
  }
  return BOARD_THEMES[key as BoardThemeKey] ?? BOARD_THEMES.classic;
}
