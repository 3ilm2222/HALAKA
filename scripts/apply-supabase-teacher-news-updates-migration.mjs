import "./load-env.js";
import { readFile } from "node:fs/promises";

const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN غير متاح.");

const query = await readFile(new URL("../supabase/migrations/20260828013000_add_teacher_news_updates.sql", import.meta.url), "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`تعذر نشر ترحيل تعديل الأخبار: ${await response.text()}`);
console.log("تم نشر دعم تعديل أخبار المعلم.");
