create table if not exists public.parent_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  client_reminder_id uuid not null unique,
  title text not null,
  body text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.parent_notifications enable row level security;
revoke all on table public.parent_notifications from anon, authenticated;
