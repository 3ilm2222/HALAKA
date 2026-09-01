import { describe, expect, it } from "vitest";

import { localDateKey } from "../lib/local-date";

describe("التاريخ المحلي", () => {
  it("ينشئ مفتاح اليوم من تاريخ الجهاز المحلي", () => {
    expect(localDateKey(new Date(2026, 7, 27, 0, 5))).toBe("2026-08-27");
  });
});
