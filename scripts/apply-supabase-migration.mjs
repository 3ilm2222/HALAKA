import { readFile } from "node:fs/promises";

const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const migrationPath = new URL(
  "../supabase/migrations/20260826164000_initialize_quran_school.sql",
  import.meta.url,
);

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required to apply the migration.");
}

const query = await readFile(migrationPath, "utf8");
const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);

if (!response.ok) {
  const details = await response.text();
  throw new Error(`Supabase migration failed (${response.status}): ${details}`);
}

console.log("Supabase migration applied successfully.");
