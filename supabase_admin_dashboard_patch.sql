-- Ragebaiters Admin-Dashboard Team Patch
-- Diese Datei im Supabase SQL Editor ausführen.

create table if not exists public.team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_on_team boolean not null default false,
  is_team_lead boolean not null default false,
  team_role text,
  team_image_url text,
  team_sort_order integer not null default 999,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create or replace function public.admin_list_team_members()
returns table (
  user_id uuid,
  show_on_team boolean,
  is_team_lead boolean,
  team_role text,
  team_image_url text,
  team_sort_order integer,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tm.user_id,
    tm.show_on_team,
    tm.is_team_lead,
    tm.team_role,
    tm.team_image_url,
    tm.team_sort_order,
    tm.updated_at
  from public.team_members tm
  where public.is_admin()
  order by tm.is_team_lead desc, tm.team_sort_order asc, tm.updated_at desc;
$$;

create or replace function public.admin_upsert_team_member(
  p_user_id uuid,
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
  v_team_role text;
  v_team_image_url text;
  v_team_sort_order integer;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins duerfen Teamdaten bearbeiten.';
  end if;

  v_team_role := nullif(trim(coalesce(p_team_role, '')), '');
  v_team_image_url := nullif(trim(coalesce(p_team_image_url, '')), '');
  v_team_sort_order := greatest(coalesce(p_team_sort_order, 999), 0);

  insert into public.team_members (
    user_id,
    show_on_team,
    is_team_lead,
    team_role,
    team_image_url,
    team_sort_order,
    updated_at,
    updated_by
  )
  values (
    p_user_id,
    coalesce(p_show_on_team, false) or coalesce(p_is_team_lead, false),
    coalesce(p_is_team_lead, false),
    v_team_role,
    v_team_image_url,
    v_team_sort_order,
    now(),
    auth.uid()
  )
  on conflict (user_id) do update
    set show_on_team = excluded.show_on_team,
        is_team_lead = excluded.is_team_lead,
        team_role = excluded.team_role,
        team_image_url = excluded.team_image_url,
        team_sort_order = excluded.team_sort_order,
        updated_at = now(),
        updated_by = auth.uid();

  return true;
end;
$$;

drop function if exists public.list_team_members();
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
    tm.show_on_team,
    tm.is_team_lead,
    coalesce(tm.team_role, case
      when tm.is_team_lead then 'Teamführung'
      when coalesce(p.role, 'observer') = 'admin' then 'Admin'
      when coalesce(p.role, 'observer') = 'observer' then 'Beobachter'
      else 'Mitglied'
    end) as team_role,
    tm.team_image_url,
    tm.team_sort_order
  from public.team_members tm
  join auth.users u on u.id = tm.user_id
  left join public.profiles p on p.id = u.id
  where tm.show_on_team = true
     or tm.is_team_lead = true
  order by tm.is_team_lead desc, tm.team_sort_order asc, coalesce(p.username, split_part(u.email::text, '@', 1)) asc;
$$;

grant execute on function public.admin_list_team_members() to authenticated;
grant execute on function public.admin_upsert_team_member(uuid, boolean, boolean, text, text, integer) to authenticated;
grant execute on function public.list_team_members() to anon, authenticated;
