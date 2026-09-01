/** ينسّق التاريخ وفق المنطقة الزمنية المحلية للجهاز بدلاً من UTC. */
export function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
