-- External Supabase backend for the Quran school application.
-- Client access is intentionally denied by default: validated Edge Functions
-- will be the only data gateway for the local-PIN teacher and parent flows.

create extension if not exists pgcrypto;

create table if not exists public.teacher_access (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'المعلم',
  local_pin_hash text not null,
  google_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_access(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists teacher_sessions_teacher_id_idx on public.teacher_sessions(teacher_id);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_access(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  normalized_name text not null check (char_length(normalized_name) between 1 and 160),
  age integer not null check (age between 1 and 120),
  parent_pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, normalized_name)
);

create index if not exists students_teacher_id_idx on public.students(teacher_id);
create index if not exists students_parent_lookup_idx on public.students(normalized_name);

create table if not exists public.monthly_boards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month_key varchar(7) not null check (month_key ~ '^\d{4}-\d{2}$'),
  label text not null check (char_length(label) between 1 and 40),
  elements jsonb not null default '[]'::jsonb,
  canvas_height integer not null default 560 check (canvas_height between 560 and 5000),
  theme_key varchar(32) not null default 'classic',
  theme jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, month_key)
);

create index if not exists monthly_boards_student_id_idx on public.monthly_boards(student_id);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date_key date not null,
  morning_absent boolean not null default false,
  evening_absent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date_key)
);

create index if not exists attendance_student_date_idx on public.attendance(student_id, date_key desc);

do $$
begin
  create type public.sender_role as enum ('teacher', 'parent');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  sender_role public.sender_role not null,
  content text not null check (char_length(content) between 1 and 4000),
  is_note boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_student_created_idx on public.messages(student_id, created_at);

create table if not exists public.parent_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists parent_sessions_student_id_idx on public.parent_sessions(student_id);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  parent_session_id uuid not null references public.parent_sessions(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_parent_session_idx on public.device_push_tokens(parent_session_id);

create table if not exists public.daily_cloud_backups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_access(id) on delete cascade,
  backup_date date not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, backup_date)
);

create index if not exists daily_cloud_backups_teacher_created_idx on public.daily_cloud_backups(teacher_id, created_at desc);

-- Timestamp maintenance is deliberately database-side so imported or API-updated
-- rows receive a consistent timestamp.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_access_updated_at on public.teacher_access;
create trigger teacher_access_updated_at before update on public.teacher_access
for each row execute function public.set_updated_at();

drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists monthly_boards_updated_at on public.monthly_boards;
create trigger monthly_boards_updated_at before update on public.monthly_boards
for each row execute function public.set_updated_at();

drop trigger if exists attendance_updated_at on public.attendance;
create trigger attendance_updated_at before update on public.attendance
for each row execute function public.set_updated_at();

-- The published mobile key must not be able to query school records directly.
-- Edge Functions authenticate teacher/parent sessions and use their server-side
-- credentials only after authorization succeeds.
alter table public.teacher_access enable row level security;
alter table public.teacher_sessions enable row level security;
alter table public.students enable row level security;
alter table public.monthly_boards enable row level security;
alter table public.attendance enable row level security;
alter table public.messages enable row level security;
alter table public.parent_sessions enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.daily_cloud_backups enable row level security;

revoke all on table public.teacher_access, public.teacher_sessions, public.students,
  public.monthly_boards, public.attendance, public.messages, public.parent_sessions,
  public.device_push_tokens, public.daily_cloud_backups from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-images',
  'board-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No policy is granted for the app roles. Board image uploads/downloads use
-- short-lived signed URLs issued only by the protected Edge Function.
