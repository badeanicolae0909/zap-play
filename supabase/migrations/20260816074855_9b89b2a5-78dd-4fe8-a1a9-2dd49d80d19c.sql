drop policy if exists "first user can claim admin" on public.user_roles;

create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_has_admin boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  select exists(select 1 from public.user_roles where role = 'admin') into v_has_admin;
  if v_has_admin then
    return false;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'admin')
  on conflict (user_id, role) do nothing;

  return true;
end;
$$;

grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.claim_first_admin() to service_role;