-- BioMarQ: Prodrome — staff accounts, doctor verification and audit log (SYNTHETIC DEMO).
-- Run once in the Supabase SQL Editor, AFTER demo_workspaces.sql. Safe to re-run.
--
-- Staff (doctors, labs, the hospital admin) sign in with Supabase Auth. Each auth user
-- has one row in public.profiles with their role and account status:
--   pending   → just registered; can log in but sees no patient data
--   verified  → approved by the hospital admin
--   suspended → blocked by the hospital admin
-- Patients do NOT use Supabase Auth (phone + simulated OTP in the app).
--
-- Status changes only go through public.set_account_status(), which checks that the
-- caller is a verified admin who has completed 2FA (aal2) and writes the audit row
-- in the same transaction. There is no UPDATE policy on profiles for any client.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           text not null check (role in ('doctor', 'lab', 'admin')),
  name           text not null check (char_length(name) between 2 and 120),
  email          text not null,
  hospital       text,
  specialty      text check (specialty is null or char_length(specialty) <= 120),
  council_reg_no text check (council_reg_no is null or council_reg_no ~ '^[A-Za-z0-9 /-]{4,30}$'),
  -- Links a seeded demo account to its app user (e.g. 'u-meera' → her patient list).
  app_user_id    text unique,
  status         text not null default 'pending' check (status in ('pending', 'verified', 'suspended')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_doctor_reg check (role <> 'doctor' or council_reg_no is not null)
);

create or replace function public.profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.profiles_touch();

-- ---------------------------------------------------------------- audit log (append-only)
create table if not exists public.account_audit_log (
  id          bigint generated always as identity primary key,
  target_id   uuid references public.profiles (id) on delete set null,
  target_name text not null,
  target_role text not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text not null,
  old_status  text not null,
  new_status  text not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists account_audit_log_target_idx on public.account_audit_log (target_id);
create index if not exists account_audit_log_actor_idx on public.account_audit_log (actor_id);

-- ---------------------------------------------------------------- helpers
-- True when the caller is a verified hospital admin. SECURITY DEFINER so it can read
-- profiles without recursing through RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'verified'
  );
$$;

-- True when this session completed 2FA.
create or replace function public.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_aal2() from public, anon;
grant execute on function public.is_aal2() to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.account_audit_log enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: admin reads all" on public.profiles;
drop policy if exists "audit log: admin reads" on public.account_audit_log;

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admin reads all"
  on public.profiles for select
  to authenticated
  using ((select public.is_admin()) and (select public.is_aal2()));

create policy "audit log: admin reads"
  on public.account_audit_log for select
  to authenticated
  using ((select public.is_admin()) and (select public.is_aal2()));

-- Read only for clients. Writes happen in the SECURITY DEFINER functions below.
revoke all on public.profiles from anon, authenticated;
revoke all on public.account_audit_log from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.account_audit_log to authenticated;

-- ---------------------------------------------------------------- sign-up → profile
-- Keep in sync with ALLOWED_DOCTOR_DOMAINS and HOSPITAL_BY_DOMAIN in src/lib/auth.ts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role  text := meta ->> 'role';
  v_email text := lower(new.email);
  v_domain text := split_part(lower(new.email), '@', 2);
  v_reg   text := nullif(trim(meta ->> 'council_reg_no'), '');
begin
  -- Only doctors and labs can sign up. Anything else (e.g. someone asking for 'admin')
  -- gets no profile, so the app gives that login no access at all.
  if v_role is null or v_role not in ('doctor', 'lab') then
    return new;
  end if;

  if v_role = 'doctor' then
    if v_domain not in ('inara-hospital.in', 'citycare.in') then
      raise exception 'Doctor accounts must use an allowlisted hospital email domain';
    end if;
    if v_reg is null or v_reg !~ '^[A-Za-z0-9 /-]{4,30}$'
       or length(regexp_replace(v_reg, '\D', '', 'g')) < 3 then
      raise exception 'A valid medical council registration number is required';
    end if;
  end if;

  insert into public.profiles (id, role, name, email, hospital, specialty, council_reg_no, status)
  values (
    new.id,
    v_role,
    left(coalesce(nullif(trim(meta ->> 'name'), ''), v_email), 120),
    v_email,
    case v_domain
      when 'inara-hospital.in' then 'Meridian Hospital'
      when 'citycare.in' then 'CityCare Hospital'
      else nullif(trim(meta ->> 'hospital'), '')
    end,
    case when v_role = 'doctor' then left(nullif(trim(meta ->> 'specialty'), ''), 120) end,
    case when v_role = 'doctor' then upper(v_reg) end,
    'pending' -- always: only the hospital admin can verify
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- admin: change a status
create or replace function public.set_account_status(target uuid, new_status text, reason text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor  public.profiles;
  before public.profiles;
  after  public.profiles;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if actor.id is null or actor.role <> 'admin' or actor.status <> 'verified' then
    raise exception 'Only a verified hospital admin can change account status' using errcode = '42501';
  end if;
  if not public.is_aal2() then
    raise exception 'Two-factor authentication is required for this action' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'verified', 'suspended') then
    raise exception 'Unknown status %', new_status;
  end if;
  if reason is null or char_length(trim(reason)) < 3 then
    raise exception 'Please give a reason (at least 3 characters)';
  end if;

  select * into before from public.profiles where id = target for update;
  if before.id is null then
    raise exception 'Account not found';
  end if;
  if before.role not in ('doctor', 'lab') then
    raise exception 'Only doctor and lab accounts can be changed here';
  end if;
  if before.status = new_status then
    raise exception 'The account is already %', new_status;
  end if;

  update public.profiles set status = new_status where id = target returning * into after;

  insert into public.account_audit_log
    (target_id, target_name, target_role, actor_id, actor_name, old_status, new_status, reason)
  values
    (before.id, before.name, before.role, actor.id, actor.name, before.status, new_status, left(trim(reason), 500));

  return after;
end;
$$;

revoke execute on function public.set_account_status(uuid, text, text) from public, anon;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;
