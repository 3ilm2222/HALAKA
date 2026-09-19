import { describe, expect, it } from "vitest";

import { ARABIC_ALPHABET, getArabicLetter } from "../lib/student-session-list";

describe("فهرس الحروف الأبجدية", () => {
  it("يحتوي على كافة الحروف العربية الـ 28 بالترتيب الصحيح", () => {
    expect(ARABIC_ALPHABET.length).toBe(28);
    expect(ARABIC_ALPHABET[0]).toBe("أ");
    expect(ARABIC_ALPHABET[ARABIC_ALPHABET.length - 1]).toBe("ي");
    expect(ARABIC_ALPHABET.includes("ع")).toBe(true);
    expect(ARABIC_ALPHABET.includes("م")).toBe(true);
  });

  it("يحسب توزيع وتعداد الطلاب على الحروف الأبجدية بدقة", () => {
    const studentNames = [
      "أحمد محمود",
      "إبراهيم خليل",
      "آدم يوسف",
      "عبدالله عمر",
      "عمر بن الخطاب",
      "محمد علي",
      "يوسف أحمد",
    ];

    const counts: Record<string, number> = {};
    for (const name of studentNames) {
      const letter = getArabicLetter(name);
      if (letter) {
        counts[letter] = (counts[letter] ?? 0) + 1;
      }
    }

    expect(counts["أ"]).toBe(3); // أحمد، إبراهيم، آدم
    expect(counts["ع"]).toBe(2); // عبدالله، عمر
    expect(counts["م"]).toBe(1); // محمد
    expect(counts["ي"]).toBe(1); // يوسف
    expect(counts["ب"]).toBeUndefined();
  });
});
