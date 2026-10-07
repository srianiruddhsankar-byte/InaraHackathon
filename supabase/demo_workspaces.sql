-- BioMarQ: Prodrome — shared demo workspaces (SYNTHETIC DATA ONLY).
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- One row per workspace code (e.g. DEMO1). `state` holds the app's whole saved
-- demo state as JSON: { schema, epoch, origin, data }. `version` goes up by one
-- on every write; the app writes with `... where version = <the version it last saw>`
-- so two devices can't silently overwrite each other.

create table if not exists public.demo_workspaces (
  id         text primary key check (id ~ '^[A-Z0-9-]{3,20}$'),
  state      jsonb not null,
  version    integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  -- Guard against accidental huge writes (the seed is ~75 KB).
  constraint demo_workspaces_state_size check (octet_length(state::text) <= 2000000)
);

-- Keep updated_at honest (set by the database, not the browser).
create or replace function public.demo_workspaces_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists demo_workspaces_touch on public.demo_workspaces;
create trigger demo_workspaces_touch
  before insert or update on public.demo_workspaces
  for each row execute function public.demo_workspaces_touch();

-- Row Level Security: open read / create / update for the demo, NO delete.
-- Anyone holding the public anon key can read and change any workspace.
-- Acceptable only because every row is synthetic demo data.
alter table public.demo_workspaces enable row level security;

drop policy if exists "demo workspaces: read"   on public.demo_workspaces;
drop policy if exists "demo workspaces: create" on public.demo_workspaces;
drop policy if exists "demo workspaces: update" on public.demo_workspaces;

create policy "demo workspaces: read"
  on public.demo_workspaces for select
  to anon, authenticated
  using (true);

create policy "demo workspaces: create"
  on public.demo_workspaces for insert
  to anon, authenticated
  with check (true);

create policy "demo workspaces: update"
  on public.demo_workspaces for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.demo_workspaces to anon, authenticated;
revoke delete, truncate on public.demo_workspaces from anon, authenticated;

-- Realtime: broadcast row changes so other devices update live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'demo_workspaces'
  ) then
    alter publication supabase_realtime add table public.demo_workspaces;
  end if;
end;
$$;
