const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required to verify the schema.");
}

const query = `
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'teacher_access', 'students', 'monthly_boards', 'attendance',
      'messages', 'parent_sessions', 'daily_cloud_backups'
    )
  order by table_name;
`;

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, read_only: true }),
  },
);

if (!response.ok) {
  throw new Error(`Supabase schema verification failed (${response.status}): ${await response.text()}`);
}

const tables = await response.json();
const names = tables.map((row) => row.table_name).sort();
const expected = [
  "attendance",
  "daily_cloud_backups",
  "messages",
  "monthly_boards",
  "parent_sessions",
  "students",
  "teacher_access",
];

if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected schema tables: ${JSON.stringify(names)}`);
}

console.log(`Verified ${names.length} Supabase school tables.`);
