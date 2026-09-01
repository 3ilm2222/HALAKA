alter table public.teacher_news
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists teacher_news_updated_at on public.teacher_news;
create trigger teacher_news_updated_at before update on public.teacher_news
for each row execute function public.set_updated_at();
