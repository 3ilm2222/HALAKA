import { describe, expect, it } from "vitest";

import { normalizeStudentName } from "../server/db";
import { currentMonthKey, nextMonthKey } from "../lib/months";
import { QURAN_SURAHS } from "../lib/quran-surahs";
import { BOARD_THEMES, getBoardTheme, normalizeCustomTheme } from "../lib/board-themes";
import { attendanceDateLabel, attendanceForMonth } from "../lib/attendance";

describe("سجل الأشهر", () => {
  it("ينشئ مفتاح الشهر بصيغة ثابتة", () => {
    expect(currentMonthKey(new Date(2026, 7, 25))).toBe("2026-08");
  });

  it("ينتقل من ديسمبر إلى يناير في السنة التالية", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });
});

describe("بيانات دخول ولي الأمر", () => {
  it("يطبع اسم الطالب بفراغات موحّدة لتقليل أخطاء الدخول", () => {
    expect(normalizeStudentName("  أحمد   محمد  ")).toBe("أحمد محمد");
  });
});

describe("قائمة السور", () => {
  it("تتضمن سور القرآن الكريم كاملة بالترتيب", () => {
    expect(QURAN_SURAHS).toHaveLength(114);
    expect(QURAN_SURAHS[0]).toBe("الفاتحة");
    expect(QURAN_SURAHS[113]).toBe("الناس");
  });
});

describe("ثيمات السبورة", () => {
  it("يبقي الثيم القرآني الأصلي هو الخيار الافتراضي", () => {
    expect(BOARD_THEMES.classic.label).toBe("الأصلي القرآني");
    expect(getBoardTheme("ثيم غير معروف")).toEqual(BOARD_THEMES.classic);
  });

  it("يقبل ألوان الثيم المخصص بصيغة HEX ويعيد القيم غير الصحيحة إلى الافتراضي", () => {
    const custom = normalizeCustomTheme({ canvas: "#112233", accent: "#445566", ink: "غير صالح", gold: "#AABBCC" });
    expect(custom.canvas).toBe("#112233");
    expect(custom.accent).toBe("#445566");
    expect(custom.ink).toBe("#21332D");
    expect(getBoardTheme("custom", custom).fullSurface).toBe("#445566");
  });
});

describe("سجل الغياب", () => {
  it("يصفي سجلات الشهر الحالي فقط من دون خلط الأشهر", () => {
    const rows = attendanceForMonth([
      { dateKey: "2026-08-26", morningAbsent: true, eveningAbsent: false },
      { dateKey: "2026-09-01", morningAbsent: false, eveningAbsent: true },
    ], "2026-08");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dateKey).toBe("2026-08-26");
  });

  it("ينشئ عنوان غياب عربي يتضمن اليوم والتاريخ", () => {
    expect(attendanceDateLabel("2026-08-26")).toContain("٢٦");
  });
});
