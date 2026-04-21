-- Ragebaiters Admin Dashboard / Supabase Setup
-- Diese komplette Datei im Supabase SQL Editor ausfuehren.
-- Enthaelt:
-- - Rollen: observer, member, admin
-- - Invite-Workflow
-- - Banner-Einstellungen
-- - Benutzerverwaltung
-- - Observer-Upload-Review
-- - Admin-Freigabe / Troll / Loeschen
-- - Oeffentliche und interne Galerie-Logik

drop view if exists public.photos_public;

drop function if exists public.check_invite_code(text);
drop function if exists public.redeem_invite(text);
drop function if exists public.is_admin(uuid);
drop function if exists public.current_user_role(uuid);
drop function if exists public.get_homepage_banner();
drop function if exists public.admin_set_homepage_banner(text);
drop function if exists public.admin_list_invites();
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite(text, text);
drop function if exists public.admin_create_invite(text, text, text);
drop function if exists public.admin_delete_invite(text);
drop function if exists public.admin_list_users();
drop function if exists public.dashboard_list_members();
drop function if exists public.admin_update_user(uuid, text, text);
drop function if exists public.admin_delete_user(uuid);
drop function if exists public.create_photo_upload(text, text, text, bigint, integer, integer);
drop function if exists public.admin_approve_photo(bigint);
drop function if exists public.admin_mark_photo_as_troll(bigint);
drop function if exists public.admin_delete_photo(bigint);
drop function if exists public.list_gallery_photos(boolean);
drop function if exists public.get_latest_gallery_photo(boolean);

create table if not exists public.site_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (key, value_text)
values ('homepage_banner_variant', 'team')
on conflict (key) do nothing;

alter table public.invites add column if not exists created_at timestamptz not null default now();
alter table public.invites add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.invites add column if not exists used_at timestamptz;
alter table public.invites add column if not exists used_by uuid references auth.users (id) on delete set null;
alter table public.invites add column if not exists role text not null default 'member';

alter table public.photos add column if not exists visibility text not null default 'public';
alter table public.photos alter column visibility set default 'public';

update public.profiles
set role = 'observer'
where role not in ('observer', 'member', 'admin');

update public.invites
set role = 'observer'
where role not in ('observer', 'member', 'admin');

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('observer', 'member', 'admin'));

alter table public.invites
  drop constraint if exists invites_role_check;

alter table public.invites
  add constraint invites_role_check
  check (role in ('observer', 'member', 'admin'));

alter table public.photos
  drop constraint if exists photos_visibility_check;

alter table public.photos
  add constraint photos_visibility_check
  check (visibility in ('public', 'pending_review', 'troll_internal'));

update public.photos
set visibility = 'public'
where visibility is null;

update public.photos
set visibility = 'troll_internal'
where visibility = 'nathan_only';

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
    case
      when coalesce(p_user_id, auth.uid()) is null then 'guest'
      else null
    end,
    (select role from public.profiles where id = coalesce(p_user_id, auth.uid())),
    'guest'
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

create or replace function public.create_photo_upload(
  p_storage_path text,
  p_title text,
  p_caption text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_visibility text;
  v_photo_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Du musst eingeloggt sein.';
  end if;

  v_role := public.current_user_role();
  v_visibility := case
    when v_role = 'observer' then 'pending_review'
    else 'public'
  end;

  insert into public.photos (
    user_id,
    storage_path,
    title,
    caption,
    mime,
    size_bytes,
    width,
    height,
    visibility
  )
  values (
    auth.uid(),
    p_storage_path,
    left(coalesce(p_title, ''), 160),
    nullif(trim(coalesce(p_caption, '')), ''),
    case
      when lower(coalesce(p_storage_path, '')) like '%.png' then 'image/png'
      when lower(coalesce(p_storage_path, '')) like '%.webp' then 'image/webp'
      when lower(coalesce(p_storage_path, '')) like '%.gif' then 'image/gif'
      else 'image/jpeg'
    end,
    p_size_bytes,
    p_width,
    p_height,
    v_visibility
  )
  returning id into v_photo_id;

  return v_photo_id;
end;
$$;

create or replace function public.admin_approve_photo(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads freigeben.';
  end if;

  update public.photos
  set visibility = 'public'
  where id = p_photo_id;

  return found;
end;
$$;

create or replace function public.admin_mark_photo_as_troll(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads als Troll-Post markieren.';
  end if;

  update public.photos
  set storage_path = '__local__/images/nathanrole.png',
      title = 'Nathan Role',
      caption = 'schabbatt schalom',
      mime = 'image/png',
      size_bytes = null,
      width = null,
      height = null,
      visibility = 'troll_internal'
  where id = p_photo_id;

  return found;
end;
$$;

create or replace function public.admin_delete_photo(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads loeschen.';
  end if;

  delete from public.photos
  where id = p_photo_id;

  return found;
end;
$$;

create or replace function public.list_gallery_photos(p_include_internal boolean default false)
returns table (
  id bigint,
  storage_path text,
  title text,
  caption text,
  author text,
  uploaded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.storage_path,
    p.title,
    p.caption,
    coalesce(pr.username, 'anonym') as author,
    p.uploaded_at
  from public.photos p
  left join public.profiles pr on pr.id = p.user_id
  where p.visibility = 'public'
     or (
       p.visibility = 'troll_internal'
       and p_include_internal
       and auth.uid() is not null
       and public.current_user_role() in ('observer', 'admin')
     )
  order by p.uploaded_at desc;
$$;

create or replace function public.get_latest_gallery_photo(p_include_internal boolean default false)
returns table (
  id bigint,
  storage_path text,
  title text,
  caption text,
  author text,
  uploaded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.list_gallery_photos(p_include_internal)
  limit 1;
$$;

create or replace view public.photos_public as
select *
from public.list_gallery_photos(false);

grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.current_user_role(uuid) to authenticated;
grant execute on function public.get_homepage_banner() to anon, authenticated;
grant execute on function public.admin_set_homepage_banner(text) to authenticated;
grant execute on function public.admin_list_invites() to authenticated;
grant execute on function public.admin_create_invite(text, text, text) to authenticated;
grant execute on function public.admin_delete_invite(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.dashboard_list_members() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.create_photo_upload(text, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.admin_approve_photo(bigint) to authenticated;
grant execute on function public.admin_mark_photo_as_troll(bigint) to authenticated;
grant execute on function public.admin_delete_photo(bigint) to authenticated;
grant execute on function public.list_gallery_photos(boolean) to anon, authenticated;
grant execute on function public.get_latest_gallery_photo(boolean) to anon, authenticated;

grant select on public.photos_public to anon, authenticated;
