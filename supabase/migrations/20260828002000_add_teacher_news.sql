create table if not exists public.teacher_news (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_access(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 800),
  created_at timestamptz not null default now()
);

create index if not exists teacher_news_teacher_created_idx on public.teacher_news(teacher_id, created_at desc);

alter table public.teacher_news enable row level security;
revoke all on table public.teacher_news from anon, authenticated;
