-- Ragebaiters Admin Dashboard / Supabase Setup
-- Diese Datei im Supabase SQL Editor ausfuehren.

drop function if exists public.admin_list_invites();
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite(text, text);
drop function if exists public.admin_create_invite(text, text, text);
drop function if exists public.dashboard_list_members();
drop function if exists public.redeem_invite(text);

create table if not exists public.site_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('observer', 'member', 'admin'));

insert into public.site_settings (key, value_text)
values ('homepage_banner_variant', 'team')
on conflict (key) do nothing;

alter table public.invites add column if not exists created_at timestamptz not null default now();
alter table public.invites add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.invites add column if not exists used_at timestamptz;
alter table public.invites add column if not exists used_by uuid references auth.users (id) on delete set null;
alter table public.invites add column if not exists role text not null default 'member';

alter table public.invites
  drop constraint if exists invites_role_check;

alter table public.invites
  add constraint invites_role_check
  check (role in ('observer', 'member', 'admin'));

create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.invites
    where upper(trim(code)) = upper(trim(p_code))
      and used_at is null
      and used_by is null
  );
$$;

create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Du musst eingeloggt sein, um einen Einladungscode einzuloesen.';
  end if;

  update public.invites
    set used_at = now(),
        used_by = auth.uid()
  where id = (
    select id
    from public.invites
    where upper(trim(code)) = upper(trim(p_code))
      and used_at is null
      and used_by is null
    limit 1
  )
  returning role into v_role;

  return v_role;
end;
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = coalesce(p_user_id, auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.current_user_role(p_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role from public.profiles where id = coalesce(p_user_id, auth.uid())),
    'observer'
  );
$$;

create or replace function public.get_homepage_banner()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select value_text from public.site_settings where key = 'homepage_banner_variant'),
    'team'
  );
$$;

create or replace function public.admin_set_homepage_banner(p_variant text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen das Startseiten-Banner aendern.';
  end if;

  if p_variant not in ('sponsor', 'team') then
    raise exception 'Ungueltige Banner-Variante: %', p_variant;
  end if;

  insert into public.site_settings (key, value_text, updated_at, updated_by)
  values ('homepage_banner_variant', p_variant, now(), auth.uid())
  on conflict (key) do update
    set value_text = excluded.value_text,
        updated_at = now(),
        updated_by = auth.uid();

  return true;
end;
$$;

create or replace function public.admin_list_invites()
returns table (
  code text,
  invite_for text,
  invite_role text,
  created_at timestamptz,
  created_by uuid,
  created_by_username text,
  used_at timestamptz,
  used_by uuid,
  used_by_username text,
  is_used boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.code,
    i."for" as invite_for,
    i.role as invite_role,
    i.created_at,
    i.created_by,
    creator.username as created_by_username,
    i.used_at,
    i.used_by,
    consumer.username as used_by_username,
    (i.used_at is not null or i.used_by is not null) as is_used
  from public.invites i
  left join public.profiles creator on creator.id = i.created_by
  left join public.profiles consumer on consumer.id = i.used_by
  where public.is_admin()
  order by i.created_at desc nulls last, i.code asc;
$$;

create or replace function public.admin_create_invite(
  p_code text default null,
  p_for text default null,
  p_role text default 'member'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Einladungscodes erstellen.';
  end if;

  v_code := upper(trim(coalesce(p_code, '')));
  v_role := trim(coalesce(p_role, 'member'));
  if v_code = '' then
    v_code := 'RAGE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;

  if v_role not in ('observer', 'member', 'admin') then
    raise exception 'Ungueltige Rollen-Zuordnung fuer Einladungscode.';
  end if;

  insert into public.invites (code, "for", role, created_at, created_by)
  values (v_code, nullif(trim(coalesce(p_for, '')), ''), v_role, now(), auth.uid());

  return v_code;
exception
  when unique_violation then
    raise exception 'Dieser Einladungscode existiert bereits.';
end;
$$;

create or replace function public.admin_delete_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Einladungscodes loeschen.';
  end if;

  delete from public.invites
  where code = trim(p_code);

  return found;
end;
$$;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  username text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    u.id,
    u.email::text,
    p.username,
    coalesce(p.role, 'observer') as role,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;

create or replace function public.dashboard_list_members()
returns table (
  username text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(p.username, split_part(u.email::text, '@', 1)) as username,
    coalesce(p.role, 'observer') as role,
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.current_user_role() in ('member', 'admin')
  order by coalesce(p.username, split_part(u.email::text, '@', 1)) asc;
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_username text,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Benutzer bearbeiten.';
  end if;

  v_username := trim(coalesce(p_username, ''));
  v_role := trim(coalesce(p_role, 'member'));

  if v_username = '' then
    raise exception 'Der Benutzername darf nicht leer sein.';
  end if;

  if length(v_username) < 3 or length(v_username) > 32 then
    raise exception 'Der Benutzername muss zwischen 3 und 32 Zeichen lang sein.';
  end if;

  if v_username !~ '^[A-Za-z0-9_.-]+$' then
    raise exception 'Der Benutzername enthaelt ungueltige Zeichen.';
  end if;

  if v_role not in ('observer', 'member', 'admin') then
    raise exception 'Ungueltige Rolle.';
  end if;

  if exists (
    select 1
    from public.profiles
    where username = v_username
      and id <> p_user_id
  ) then
    raise exception 'Dieser Benutzername ist bereits vergeben.';
  end if;

  insert into public.profiles (id, username, role)
  values (p_user_id, v_username, v_role)
  on conflict (id) do update
    set username = excluded.username,
        role = excluded.role;

  return true;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Benutzer loeschen.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Du kannst deinen eigenen Admin-Account hier nicht loeschen.';
  end if;

  delete from storage.objects
  where bucket_id = 'photos'
    and name like p_user_id::text || '/%';

  delete from public.photos
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1' using p_user_id;
  end if;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id = $1' using p_user_id;
  end if;

  delete from auth.users
  where id = p_user_id;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count = 0 then
    raise exception 'Benutzer wurde im Auth-System nicht gefunden oder konnte nicht geloescht werden.';
  end if;

  return true;
end;
$$;

grant execute on function public.get_homepage_banner() to anon, authenticated;
grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.current_user_role(uuid) to authenticated;
grant execute on function public.admin_set_homepage_banner(text) to authenticated;
grant execute on function public.admin_list_invites() to authenticated;
grant execute on function public.admin_create_invite(text, text, text) to authenticated;
grant execute on function public.admin_delete_invite(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.dashboard_list_members() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
