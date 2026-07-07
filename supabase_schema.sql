create extension if not exists pgcrypto;

do $$
begin
  execute 'create extension if not exists pg_cron';
exception
  when others then
    raise notice 'pg_cron is not available; run public.cleanup_old_semafor_bol_documents() manually or rely on app cleanup.';
end $$;

create table if not exists public.semafor_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.semafor_vehicles (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  truck_number text not null,
  driver_name text not null,
  driver_phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.semafor_administrators (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.semafor_tasks (
  id uuid primary key default gen_random_uuid(),
  phone_last7 text not null,
  company text not null,
  vehicle text not null,
  driver text,
  type text not null,
  description text not null,
  status text not null default 'Active',
  bol_mode text default 'none',
  bol_file_name text,
  bol_file_url text,
  bol_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.semafor_tasks add column if not exists bol_mode text default 'none';
alter table public.semafor_tasks add column if not exists bol_file_name text;
alter table public.semafor_tasks add column if not exists bol_file_url text;
alter table public.semafor_tasks add column if not exists bol_uploaded_at timestamptz;

create table if not exists public.semafor_driver_documents (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  phone_last7 text not null,
  company text not null,
  vehicle text not null,
  driver text,
  mode text not null,
  file_name text not null,
  file_path text not null,
  file_url text,
  size bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.semafor_bol_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid,
  phone_last7 text not null,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create table if not exists public.semafor_push_tokens (
  id uuid primary key default gen_random_uuid(),
  phone_last7 text not null,
  token text not null unique,
  platform text not null,
  app_id text default 'com.semafor.customer',
  updated_at timestamptz not null default now()
);

alter table public.semafor_companies enable row level security;
alter table public.semafor_vehicles enable row level security;
alter table public.semafor_administrators enable row level security;
alter table public.semafor_tasks enable row level security;
alter table public.semafor_driver_documents enable row level security;
alter table public.semafor_bol_requests enable row level security;
alter table public.semafor_push_tokens enable row level security;

drop policy if exists "Allow anon app access" on public.semafor_companies;
drop policy if exists "Allow anon app access" on public.semafor_vehicles;
drop policy if exists "Allow anon app access" on public.semafor_administrators;
drop policy if exists "Allow anon app access" on public.semafor_tasks;
drop policy if exists "Allow anon app access" on public.semafor_driver_documents;
drop policy if exists "Allow anon app access" on public.semafor_bol_requests;
drop policy if exists "Allow anon app access" on public.semafor_push_tokens;

create policy "Allow anon app access"
on public.semafor_companies
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_vehicles
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_administrators
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_tasks
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_driver_documents
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_bol_requests
for all
to anon
using (true)
with check (true);

create policy "Allow anon app access"
on public.semafor_push_tokens
for all
to anon
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'semafor-bol',
  'semafor-bol',
  true,
  157286400,
  array['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow anon BOL storage access" on storage.objects;

create policy "Allow anon BOL storage access"
on storage.objects
for all
to anon
using (bucket_id = 'semafor-bol')
with check (bucket_id = 'semafor-bol');

create or replace function public.cleanup_old_semafor_bol_documents()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  old_paths text[];
begin
  select coalesce(array_agg(file_path), array[]::text[])
  into old_paths
  from public.semafor_driver_documents
  where created_at < now() - interval '7 days';

  delete from public.semafor_driver_documents
  where created_at < now() - interval '7 days';

  delete from public.semafor_bol_requests
  where requested_at < now() - interval '7 days';

  if array_length(old_paths, 1) is not null then
    delete from storage.objects
    where bucket_id = 'semafor-bol'
      and name = any(old_paths);
  end if;
end;
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('cleanup-old-semafor-bol-documents');
    exception
      when others then null;
    end;

    perform cron.schedule(
      'cleanup-old-semafor-bol-documents',
      '15 3 * * *',
      'select public.cleanup_old_semafor_bol_documents();'
    );
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_companies;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_vehicles;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_administrators;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_tasks;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_driver_documents;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_bol_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.semafor_push_tokens;
exception
  when duplicate_object then null;
end $$;

delete from public.semafor_driver_documents
where created_at < now() - interval '7 days';

delete from public.semafor_bol_requests
where requested_at < now() - interval '7 days';

delete from public.semafor_push_tokens
where updated_at < now() - interval '90 days';

insert into public.semafor_administrators (username, password)
values ('admin', 'admin123')
on conflict (username) do nothing;

insert into public.semafor_companies (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Demo Company')
on conflict (id) do nothing;

insert into public.semafor_vehicles (id, company, truck_number, driver_name, driver_phone)
values (
  '22222222-2222-4222-8222-222222222222',
  'Demo Company',
  'TR-104',
  'Demo Driver',
  '5551234567'
)
on conflict (id) do nothing;

insert into public.semafor_tasks (
  id,
  phone_last7,
  company,
  vehicle,
  driver,
  type,
  description,
  status
)
values (
  '33333333-3333-4333-8333-333333333333',
  '1234567',
  'Demo Company',
  'TR-104',
  'Demo Driver',
  'SHIFT',
  'NOW',
  'Active'
)
on conflict (id) do nothing;
