
create policy "first user can claim admin" on public.user_roles
for insert to authenticated
with check (
  user_id = auth.uid()
  and role = 'admin'
  and not exists (select 1 from public.user_roles where role = 'admin')
);

create policy "admins manage roles" on public.user_roles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
