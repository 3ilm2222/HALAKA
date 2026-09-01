const projectRef = "ihofyzhldvuwrhtidjfm";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required.");

const query = `
  select student_id, month_key, jsonb_array_length(elements) as element_count, elements, updated_at
  from public.monthly_boards
  order by updated_at desc;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, read_only: true }),
});

if (!response.ok) throw new Error(`Board inspection failed (${response.status}): ${await response.text()}`);
console.log(JSON.stringify(await response.json(), null, 2));
