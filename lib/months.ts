const arabicMonthFormatter = new Intl.DateTimeFormat("ar-SA", {
  month: "long",
  year: "numeric",
});

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return arabicMonthFormatter.format(new Date(year, month - 1, 1));
}

export function nextMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month, 1);
  return currentMonthKey(date);
}
