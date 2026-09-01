import "./load-env.js";
import { readFile } from "node:fs/promises";

const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN غير متاح.");

const query = await readFile(new URL("../supabase/migrations/20260828002000_add_teacher_news.sql", import.meta.url), "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`تعذر نشر ترحيل الأخبار: ${await response.text()}`);
console.log("تم نشر جدول أخبار المعلم.");
