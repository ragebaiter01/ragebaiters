-- Ragebaiters Team Update
-- Diese Datei nach der bisherigen Supabase-Einrichtung im SQL Editor ausführen.

alter table public.profiles add column if not exists show_on_team boolean not null default false;
alter table public.profiles add column if not exists is_team_lead boolean not null default false;
alter table public.profiles add column if not exists team_role text;
alter table public.profiles add column if not exists team_image_url text;
alter table public.profiles add column if not exists team_sort_order integer not null default 999;

drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  username text,
  role text,
  show_on_team boolean,
  is_team_lead boolean,
  team_role text,
  team_image_url text,
  team_sort_order integer,
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
    coalesce(p.show_on_team, false) as show_on_team,
    coalesce(p.is_team_lead, false) as is_team_lead,
    p.team_role,
    p.team_image_url,
    coalesce(p.team_sort_order, 999) as team_sort_order,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by u.created_at desc;
$$;

drop function if exists public.admin_update_user(uuid, text, text);
drop function if exists public.admin_update_user(uuid, text, text, boolean, boolean, text, text, integer);
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_username text,
  p_role text,
  p_show_on_team boolean default false,
  p_is_team_lead boolean default false,
  p_team_role text default null,
  p_team_image_url text default null,
  p_team_sort_order integer default 999
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_role text;
  v_team_role text;
  v_team_image_url text;
  v_team_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Benutzer bearbeiten.';
  end if;

  v_username := trim(coalesce(p_username, ''));
  v_role := trim(coalesce(p_role, 'member'));
  v_team_role := nullif(trim(coalesce(p_team_role, '')), '');
  v_team_image_url := nullif(trim(coalesce(p_team_image_url, '')), '');
  v_team_sort_order := greatest(coalesce(p_team_sort_order, 999), 0);

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

  insert into public.profiles (
    id,
    username,
    role,
    show_on_team,
    is_team_lead,
    team_role,
    team_image_url,
    team_sort_order
  )
  values (
    p_user_id,
    v_username,
    v_role,
    coalesce(p_show_on_team, false) or coalesce(p_is_team_lead, false),
    coalesce(p_is_team_lead, false),
    v_team_role,
    v_team_image_url,
    v_team_sort_order
  )
  on conflict (id) do update
    set username = excluded.username,
        role = excluded.role,
        show_on_team = excluded.show_on_team,
        is_team_lead = excluded.is_team_lead,
        team_role = excluded.team_role,
        team_image_url = excluded.team_image_url,
        team_sort_order = excluded.team_sort_order;

  return true;
end;
$$;

create or replace function public.list_team_members()
returns table (
  username text,
  role text,
  show_on_team boolean,
  is_team_lead boolean,
  team_role text,
  team_image_url text,
  team_sort_order integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(p.username, split_part(u.email::text, '@', 1)) as username,
    coalesce(p.role, 'observer') as role,
    coalesce(p.show_on_team, false) as show_on_team,
    coalesce(p.is_team_lead, false) as is_team_lead,
    coalesce(p.team_role, case
      when coalesce(p.is_team_lead, false) then 'Teamführung'
      when coalesce(p.role, 'observer') = 'admin' then 'Admin'
      when coalesce(p.role, 'observer') = 'observer' then 'Beobachter'
      else 'Mitglied'
    end) as team_role,
    p.team_image_url,
    coalesce(p.team_sort_order, 999) as team_sort_order
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p.show_on_team, false) = true
     or coalesce(p.is_team_lead, false) = true
  order by coalesce(p.is_team_lead, false) desc,
           coalesce(p.team_sort_order, 999) asc,
           coalesce(p.username, split_part(u.email::text, '@', 1)) asc;
$$;

drop function if exists public.create_photo_upload(text, text, text, bigint, integer, integer);
create or replace function public.create_photo_upload(
  p_storage_path text,
  p_title text,
  p_caption text default null,
  p_size_bytes bigint default null,
  p_width integer default null,
  p_height integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Du musst eingeloggt sein, um Bilder hochzuladen.';
  end if;

  insert into public.photos (
    user_id,
    storage_path,
    title,
    caption,
    size_bytes,
    width,
    height,
    visibility
  )
  values (
    auth.uid(),
    trim(coalesce(p_storage_path, '')),
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_caption, '')), ''),
    p_size_bytes,
    p_width,
    p_height,
    case
      when public.current_user_role() = 'observer' then 'pending_review'
      else 'public'
    end
  );

  return true;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, boolean, boolean, text, text, integer) to authenticated;
grant execute on function public.list_team_members() to anon, authenticated;
grant execute on function public.create_photo_upload(text, text, text, bigint, integer, integer) to authenticated;
