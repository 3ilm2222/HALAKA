alter table public.messages add column if not exists client_id uuid;
create unique index if not exists messages_client_id_unique_idx on public.messages(client_id) where client_id is not null;
