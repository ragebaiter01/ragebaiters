-- Ragebaiters Admin Dashboard / Supabase Setup
-- Diese Datei im Supabase SQL Editor ausfuehren.
-- Enthält den Observer-Review-Workflow inkl. Admin-Troll-Aktion.

drop function if exists public.admin_list_invites();
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite(text, text);
drop function if exists public.admin_create_invite(text, text, text);
drop function if exists public.dashboard_list_members();
drop function if exists public.redeem_invite(text);
drop function if exists public.admin_approve_photo(bigint);
drop function if exists public.admin_mark_photo_as_troll(bigint);
drop function if exists public.admin_delete_photo(bigint);
drop view if exists public.photos_public;
drop function if exists public.list_gallery_photos(boolean);
drop function if exists public.get_latest_gallery_photo(boolean);
drop function if exists public.can_view_nathan_posts(uuid);
drop function if exists public.admin_get_test_account_access();
drop function if exists public.admin_rotate_test_account_access(text);
drop function if exists public.resolve_login_email(text);
drop function if exists public.hard_delete_user_account(uuid);
drop function if exists public.admin_cleanup_expired_test_accounts(text);
drop function if exists public.get_homepage_instagram_post();
drop function if exists public.admin_set_homepage_instagram_post(text, text, text, text, timestamptz, text);
drop function if exists public.get_team_members();
drop function if exists public.admin_set_team_members(jsonb);

create table if not exists public.site_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

update public.profiles
set role = 'observer'
where role = 'nathan';

update public.invites
set role = 'observer'
where role = 'nathan';

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
alter table public.photos add column if not exists visibility text not null default 'public';
alter table public.photos alter column visibility set default 'public';

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

update public.photos p
set visibility = 'pending_review'
from public.profiles pr
where pr.id = p.user_id
  and pr.role = 'observer'
  and coalesce(p.visibility, 'public') = 'public';

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

-- ============================================================
-- Homepage Instagram Card (Design vorbereitet fuer Live-Sync)
-- ============================================================

drop function if exists public.get_homepage_instagram_post();
drop function if exists public.admin_set_homepage_instagram_post(text, text, text, text, timestamptz, text);

insert into public.site_settings (key, value_text)
values
  ('homepage_instagram_post_url', ''),
  ('homepage_instagram_image_url', ''),
  ('homepage_instagram_title', ''),
  ('homepage_instagram_caption', ''),
  ('homepage_instagram_posted_at', ''),
  ('homepage_instagram_username', 'die_ragebaiters')
on conflict (key) do nothing;

create or replace function public.get_homepage_instagram_post()
returns table (
  post_url text,
  image_url text,
  title text,
  caption text,
  posted_at timestamptz,
  username text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select value_text from public.site_settings where key = 'homepage_instagram_post_url'), '') as post_url,
    coalesce((select value_text from public.site_settings where key = 'homepage_instagram_image_url'), '') as image_url,
    coalesce((select value_text from public.site_settings where key = 'homepage_instagram_title'), '') as title,
    coalesce((select value_text from public.site_settings where key = 'homepage_instagram_caption'), '') as caption,
    nullif((select value_text from public.site_settings where key = 'homepage_instagram_posted_at'), '')::timestamptz as posted_at,
    coalesce((select value_text from public.site_settings where key = 'homepage_instagram_username'), 'die_ragebaiters') as username;
$$;

create or replace function public.admin_set_homepage_instagram_post(
  p_post_url text,
  p_image_url text,
  p_title text default '',
  p_caption text default '',
  p_posted_at timestamptz default null,
  p_username text default 'die_ragebaiters'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen den Instagram-Beitrag auf der Startseite aendern.';
  end if;

  insert into public.site_settings (key, value_text, updated_at, updated_by)
  values
    ('homepage_instagram_post_url', trim(coalesce(p_post_url, '')), now(), auth.uid()),
    ('homepage_instagram_image_url', trim(coalesce(p_image_url, '')), now(), auth.uid()),
    ('homepage_instagram_title', trim(coalesce(p_title, '')), now(), auth.uid()),
    ('homepage_instagram_caption', trim(coalesce(p_caption, '')), now(), auth.uid()),
    ('homepage_instagram_posted_at', coalesce(p_posted_at::text, ''), now(), auth.uid()),
    ('homepage_instagram_username', trim(coalesce(p_username, 'die_ragebaiters')), now(), auth.uid())
  on conflict (key) do update
    set value_text = excluded.value_text,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return true;
end;
$$;

grant execute on function public.get_homepage_instagram_post() to anon, authenticated;
grant execute on function public.admin_set_homepage_instagram_post(text, text, text, text, timestamptz, text) to authenticated;

-- ============================================================
-- Team-Verwaltung fuer Dashboard + Team-Seite
-- ============================================================

drop function if exists public.get_team_members();
drop function if exists public.admin_set_team_members(jsonb);

insert into public.site_settings (key, value_text)
values (
  'team_members_json',
  $$[
    {"id":"ben","name":"Yotzek (Ben)","role":"Teamfuehrer","description":"Ben koordiniert die Truppe und bewahrt selbst im Gefecht einen kuehlen Kopf.","image_url":"images/benf.png","is_leader":true,"sort_order":10},
    {"id":"jason","name":"sneiper0 (Jason)","role":"Sniper","description":"Praezisionsschuetze der Ragebaiters.","image_url":"images/logo.png","is_leader":false,"sort_order":20},
    {"id":"michael","name":"MundMbrothers (Michael)","role":"Medic","description":"Sorgt fuer die Einsatzfaehigkeit des Teams.","image_url":"images/michi2.png","is_leader":false,"sort_order":30},
    {"id":"nils","name":"Disccave (Nils)","role":"Breacher / OG","description":"Einer der OGs. Experte fuer Improvisation.","image_url":"images/nils.png","is_leader":false,"sort_order":40},
    {"id":"nathan","name":"Nathan Goldstein (Nathan)","role":"Support","description":"Gibt Feuerschutz mit hohem Munitionsdurchsatz.","image_url":"images/nathan.png","is_leader":false,"sort_order":50},
    {"id":"riccardo","name":"Gemeral Richard (Riccardo)","role":"Breacher","description":"Spezialist fuer CQB.","image_url":"images/riccardo.png","is_leader":false,"sort_order":60},
    {"id":"wolfgang","name":"Wolfgang","role":"Techniker","description":"Haelt die Markierer am Laufen.","image_url":"images/wolfgang.png","is_leader":false,"sort_order":70}
  ]$$
)
on conflict (key) do nothing;

create or replace function public.get_team_members()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select value_text::jsonb from public.site_settings where key = 'team_members_json'),
    '[]'::jsonb
  );
$$;

create or replace function public.admin_set_team_members(p_members jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen die Team-Seite bearbeiten.';
  end if;

  if jsonb_typeof(coalesce(p_members, 'null'::jsonb)) <> 'array' then
    raise exception 'Die Team-Daten muessen als JSON-Array gespeichert werden.';
  end if;

  insert into public.site_settings (key, value_text, updated_at, updated_by)
  values ('team_members_json', p_members::text, now(), auth.uid())
  on conflict (key) do update
    set value_text = excluded.value_text,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return true;
end;
$$;

grant execute on function public.get_team_members() to anon, authenticated;
grant execute on function public.admin_set_team_members(jsonb) to authenticated;

-- ============================================================
-- Testaccount fuer Admin-Vorschau
-- Erlaubt Admins, einen getrennten Observer-Testaccount in
-- einem neuen Tab zu oeffnen, ohne ihren eigenen Login zu verlieren.
-- ============================================================

create table if not exists public.site_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (key, value_text)
values
  ('test_account_email', 'testaccount@ragebaiters.local'),
  ('test_account_username', 'testaccount-preview'),
  ('test_account_role', 'observer')
on conflict (key) do nothing;

update public.site_settings
set value_text = 'observer',
    updated_at = now()
where key = 'test_account_role';

create or replace function public.admin_get_test_account_access()
returns table (
  email text,
  password text,
  username text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_password text;
  v_username text;
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen den Testaccount oeffnen.';
  end if;

  select value_text into v_email
  from public.site_settings
  where key = 'test_account_email';

  select value_text into v_username
  from public.site_settings
  where key = 'test_account_username';

  select value_text into v_role
  from public.site_settings
  where key = 'test_account_role';

  select value_text into v_password
  from public.site_settings
  where key = 'test_account_password';

  if coalesce(v_password, '') = '' then
    v_password := substr(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', ''),
      1,
      28
    ) || 'A9!';

    insert into public.site_settings (key, value_text, updated_at, updated_by)
    values ('test_account_password', v_password, now(), auth.uid())
    on conflict (key) do update
      set value_text = excluded.value_text,
          updated_at = now(),
          updated_by = auth.uid();
  end if;

  return query
  select
    coalesce(v_email, 'testaccount@ragebaiters.local'),
    v_password,
    coalesce(v_username, 'testaccount-preview'),
    'observer'::text;
end;
$$;

create or replace function public.admin_prepare_test_account(
  p_email text,
  p_username text default 'testaccount-preview',
  p_role text default 'observer'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_username text;
  v_role text;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen den Testaccount vorbereiten.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  v_username := trim(coalesce(p_username, 'testaccount-preview'));
  v_role := 'observer';

  if v_email = '' then
    raise exception 'Die Testaccount-E-Mail fehlt.';
  end if;

  if v_role not in ('observer', 'member', 'admin') then
    raise exception 'Ungueltige Testaccount-Rolle.';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email::text) = v_email
  order by created_at desc
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles
    where username = v_username
      and id <> v_user_id
  ) then
    v_username := left(v_username || '-' || substr(replace(v_user_id::text, '-', ''), 1, 6), 32);
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_username),
      updated_at = now()
  where id = v_user_id;

  insert into public.profiles (id, username, role)
  values (v_user_id, v_username, v_role)
  on conflict (id) do update
    set username = excluded.username,
        role = excluded.role;

  return true;
end;
$$;

grant execute on function public.admin_get_test_account_access() to authenticated;
grant execute on function public.admin_prepare_test_account(text, text, text) to authenticated;

-- Optionaler Schnelltest nach dem Ausfuehren:
-- select proname
-- from pg_proc
-- join pg_namespace n on n.oid = pg_proc.pronamespace
-- where n.nspname = 'public'
--   and proname in ('admin_get_test_account_access', 'admin_prepare_test_account');

create or replace function public.admin_delete_photo(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storage_path text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads loeschen.';
  end if;

  select storage_path
  into v_storage_path
  from public.photos
  where id = p_photo_id;

  if v_storage_path is null then
    return false;
  end if;

  -- Storage-Dateien werden clientseitig ueber die Storage API entfernt.

  delete from public.photos
  where id = p_photo_id;

  return found;
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

  -- Storage-Dateien werden clientseitig ueber die Storage API entfernt.

  delete from public.photos
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id::text = $1' using p_user_id::text;
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
grant execute on function public.list_gallery_photos(boolean) to anon, authenticated;
grant execute on function public.get_latest_gallery_photo(boolean) to anon, authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_approve_photo(bigint) to authenticated;
grant execute on function public.admin_mark_photo_as_troll(bigint) to authenticated;
grant execute on function public.admin_delete_photo(bigint) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

grant select on public.photos_public to anon, authenticated;
-- Ragebaiters Admin Dashboard / Supabase Setup
-- Diese Datei im Supabase SQL Editor ausfuehren.
-- Enthält den Observer-Review-Workflow inkl. Admin-Troll-Aktion.

drop function if exists public.admin_list_invites();
drop function if exists public.admin_create_invite(text);
drop function if exists public.admin_create_invite(text, text);
drop function if exists public.admin_create_invite(text, text, text);
drop function if exists public.dashboard_list_members();
drop function if exists public.redeem_invite(text);
drop function if exists public.admin_approve_photo(bigint);
drop function if exists public.admin_mark_photo_as_troll(bigint);
drop function if exists public.admin_delete_photo(bigint);
drop view if exists public.photos_public;
drop function if exists public.list_gallery_photos(boolean);
drop function if exists public.get_latest_gallery_photo(boolean);
drop function if exists public.can_view_nathan_posts(uuid);

create table if not exists public.site_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

update public.profiles
set role = 'observer'
where role = 'nathan';

update public.invites
set role = 'observer'
where role = 'nathan';

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
alter table public.photos add column if not exists visibility text not null default 'public';
alter table public.photos alter column visibility set default 'public';

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

update public.photos p
set visibility = 'pending_review'
from public.profiles pr
where pr.id = p.user_id
  and pr.role = 'observer'
  and coalesce(p.visibility, 'public') = 'public';

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
declare
  v_storage_path text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads loeschen.';
  end if;

  select storage_path
  into v_storage_path
  from public.photos
  where id = p_photo_id;

  if v_storage_path is null then
    return false;
  end if;

  -- Storage-Dateien werden clientseitig ueber die Storage API entfernt.

  delete from public.photos
  where id = p_photo_id;

  return found;
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

  -- Storage-Dateien werden clientseitig ueber die Storage API entfernt.

  delete from public.photos
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id::text = $1' using p_user_id::text;
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
grant execute on function public.list_gallery_photos(boolean) to anon, authenticated;
grant execute on function public.get_latest_gallery_photo(boolean) to anon, authenticated;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;
grant execute on function public.admin_approve_photo(bigint) to authenticated;
grant execute on function public.admin_mark_photo_as_troll(bigint) to authenticated;
grant execute on function public.admin_delete_photo(bigint) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

grant select on public.photos_public to anon, authenticated;
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

grant execute on function public.admin_delete_photo(bigint) to authenticated;
create or replace function public.admin_mark_photo_as_troll(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_troll_path text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads als Troll-Post markieren.';
  end if;

  v_troll_path := (
    array[
      '__local__/images/nathanrole.png',
      '__local__/images/nathanrole2.png',
      '__local__/images/nathanrole3.png',
      '__local__/images/nathanrole4.png'
    ]
  )[1 + floor(random() * 4)::int];

  update public.photos
  set storage_path = v_troll_path,
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

grant execute on function public.admin_mark_photo_as_troll(bigint) to authenticated;
create or replace function public.admin_mark_photo_as_troll(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_troll_path text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads als Troll-Post markieren.';
  end if;

  v_troll_path := (
    array[
      '__local__/images/nathanrole.png',
      '__local__/images/nathanrole2.png',
      '__local__/images/nathanrole3.png',
      '__local__/images/nathanrole4.png'
    ]
  )[1 + floor(random() * 4)::int];

  update public.photos
  set storage_path = v_troll_path,
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

grant execute on function public.admin_mark_photo_as_troll(bigint) to authenticated;

-- ============================================================
-- 2026-04-23: Username-Login + 5-Minuten-Testaccount-Rotation
-- ============================================================

drop function if exists public.admin_get_test_account_access();
drop function if exists public.admin_rotate_test_account_access(text);
drop function if exists public.resolve_login_email(text);
drop function if exists public.hard_delete_user_account(uuid);
drop function if exists public.admin_cleanup_expired_test_accounts(text);

create table if not exists public.test_account_sessions (
  id uuid primary key default gen_random_uuid(),
  session_scope text not null unique,
  email text not null unique,
  username text not null,
  role text not null default 'observer',
  auth_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.test_account_sessions
  drop constraint if exists test_account_sessions_role_check;

alter table public.test_account_sessions
  add constraint test_account_sessions_role_check
  check (role in ('observer', 'member', 'admin'));

create index if not exists test_account_sessions_expires_at_idx
  on public.test_account_sessions (expires_at);

create or replace function public.hard_delete_user_account(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if p_user_id is null then
    return false;
  end if;

  -- Direkte SQL-Loeschungen in storage.objects sind in Supabase blockiert.
  -- Temporaere Testaccounts werden deshalb hier nur aus Auth- und DB-Tabellen entfernt.

  delete from public.photos
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  delete from public.test_account_sessions
  where auth_user_id = p_user_id;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id::text = $1' using p_user_id::text;
  end if;

  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id::text = $1' using p_user_id::text;
  end if;

  delete from auth.users
  where id = p_user_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
end;
$$;

create or replace function public.admin_cleanup_expired_test_accounts(
  p_force_session_scope text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_force_scope text := nullif(trim(coalesce(p_force_session_scope, '')), '');
  v_deleted_count integer := 0;
  v_session record;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Testaccounts bereinigen.';
  end if;

  for v_session in
    select session_scope, auth_user_id
    from public.test_account_sessions
    where expires_at <= now()
       or (v_force_scope is not null and session_scope = v_force_scope)
  loop
    if v_session.auth_user_id is not null then
      perform public.hard_delete_user_account(v_session.auth_user_id);
    end if;

    delete from public.test_account_sessions
    where session_scope = v_session.session_scope;

    v_deleted_count := v_deleted_count + 1;
  end loop;

  return v_deleted_count;
end;
$$;

create or replace function public.admin_get_test_account_access()
returns table (
  session_scope text,
  email text,
  password text,
  username text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed text;
  v_session_scope text;
  v_email text;
  v_password text;
  v_username text;
  v_expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen den Testaccount oeffnen.';
  end if;

  perform public.admin_cleanup_expired_test_accounts();

  v_seed := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  v_session_scope := 'test-account-' || v_seed;
  v_email := 'testaccount+' || v_seed || '@ragebaiters.local';
  v_username := 'testaccount-' || substr(v_seed, 1, 6);
  v_password := substr(
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', ''),
    1,
    28
  ) || 'A9!';
  v_expires_at := now() + interval '5 minutes';

  insert into public.test_account_sessions (
    session_scope,
    email,
    username,
    role,
    created_by,
    expires_at
  )
  values (
    v_session_scope,
    v_email,
    v_username,
    'observer',
    auth.uid(),
    v_expires_at
  );

  return query
  select
    v_session_scope,
    v_email,
    v_password,
    v_username,
    'observer'::text,
    v_expires_at;
end;
$$;

create or replace function public.admin_rotate_test_account_access(
  p_previous_session_scope text default null
)
returns table (
  session_scope text,
  email text,
  password text,
  username text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Testaccounts rotieren.';
  end if;

  perform public.admin_cleanup_expired_test_accounts(p_previous_session_scope);

  return query
  select *
  from public.admin_get_test_account_access();
end;
$$;

create or replace function public.admin_prepare_test_account(
  p_email text,
  p_username text default 'testaccount-preview',
  p_role text default 'observer'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_username text;
  v_role text;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen den Testaccount vorbereiten.';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  v_username := trim(coalesce(p_username, 'testaccount-preview'));
  v_role := 'observer';

  if v_email = '' then
    raise exception 'Die Testaccount-E-Mail fehlt.';
  end if;

  select id
  into v_user_id
  from auth.users
  where lower(email::text) = v_email
  order by created_at desc
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles
    where username = v_username
      and id <> v_user_id
  ) then
    v_username := left(v_username || '-' || substr(replace(v_user_id::text, '-', ''), 1, 6), 32);
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'username', v_username,
        'is_test_account', true
      ),
      updated_at = now()
  where id = v_user_id;

  insert into public.profiles (id, username, role)
  values (v_user_id, v_username, v_role)
  on conflict (id) do update
    set username = excluded.username,
        role = excluded.role;

  update public.test_account_sessions
  set auth_user_id = v_user_id,
      username = v_username,
      role = v_role
  where lower(email) = v_email;

  return true;
end;
$$;

create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_email text;
begin
  if v_identifier = '' then
    return null;
  end if;

  if position('@' in v_identifier) > 0 then
    return lower(v_identifier);
  end if;

  select lower(u.email::text)
  into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(v_identifier)
  order by u.created_at desc
  limit 1;

  return v_email;
end;
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
    where lower(username) = lower(v_username)
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
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Benutzer loeschen.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Du kannst deinen eigenen Admin-Account hier nicht loeschen.';
  end if;

  if not public.hard_delete_user_account(p_user_id) then
    raise exception 'Benutzer wurde im Auth-System nicht gefunden oder konnte nicht geloescht werden.';
  end if;

  return true;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.admin_cleanup_expired_test_accounts(text) to authenticated;
grant execute on function public.admin_get_test_account_access() to authenticated;
grant execute on function public.admin_rotate_test_account_access(text) to authenticated;
grant execute on function public.admin_prepare_test_account(text, text, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
create or replace function public.admin_mark_photo_as_troll(p_photo_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_troll_path text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Uploads als Troll-Post markieren.';
  end if;

  select picked.path
  into v_troll_path
  from (
    values
      ('__local__/images/nathanrole.png'),
      ('__local__/images/nathanrole2.png'),
      ('__local__/images/nathanrole3.png'),
      ('__local__/images/nathanrole4.png')
  ) as picked(path)
  order by random()
  limit 1;

  update public.photos
  set storage_path = v_troll_path,
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
