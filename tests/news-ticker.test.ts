import { describe, expect, it } from "vitest";

describe("معالجة وحسابات شريط الأخبار المتحرك", () => {
  it("يعالج النصوص متعددة الأسطر والمسافات الزائدة لتحويلها لسطر واحد متصل", () => {
    const rawContent = `إعلان هام
نرجو الحضور مبكراً
بالتوفيق للجميع`;
    const formatted = rawContent.trim().replace(/\r?\n+/g, "  ·  ");

    expect(formatted).toBe("إعلان هام  ·  نرجو الحضور مبكراً  ·  بالتوفيق للجميع");
    expect(formatted.includes("\n")).toBe(false);
  });

  it("يحسب مسافة وسرعة الحركة الهادئة بحيث تظهر أول كلمة من أقصى اليسار ويتحرك بهدوء دائم", () => {
    const textWidth = 850;
    const trackWidth = 400;

    const startX = -textWidth;
    const endX = trackWidth;
    const totalDistance = textWidth + trackWidth;

    expect(startX).toBe(-850);
    expect(endX).toBe(400);
    expect(totalDistance).toBe(1250);

    // Calm reading speed: 26 px/s ensures words are easily readable without rushing
    const speed = 26;
    const duration = Math.max(12, Math.round(totalDistance / speed));
    expect(duration).toBe(48); // 48 seconds for 1250px journey
    expect(duration).toBeGreaterThan(30);
  });

  it("يتعامل مع النصوص الطويلة جداً دون قطع", () => {
    const longArabicText = "بسم الله الرحمن الرحيم - نود إعلامكم ببدء دورة التجويد المكثفة ومسابقة حفظ سورة البقرة لجميع طلبة الحلقة، وندعو أولياء الأمور الكرام لتشجيع أبنائهم والمتابعة الدورية عبر هذا التطبيق السحابي والتواصل مع المعلم عند وجود أي استفسار.";
    const formatted = longArabicText.trim().replace(/\r?\n+/g, "  ·  ");

    expect(formatted.length).toBeGreaterThan(150);
    expect(formatted.startsWith("بسم الله")).toBe(true);
  });
});
