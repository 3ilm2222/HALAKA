import { readFile } from "node:fs/promises";

const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const migrationPath = new URL("../supabase/migrations/20260827230000_add_week_reminders.sql", import.meta.url);

if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required to apply the migration.");

const query = await readFile(migrationPath, "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

if (!response.ok) throw new Error(`Supabase week reminder migration failed (${response.status}): ${await response.text()}`);
console.log("Supabase week reminder migration applied successfully.");
