alter table public.clientes enable row level security;

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clientes'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.clientes', p.policyname);
  end loop;
end $$;

create policy "allow select clientes admin"
on public.clientes
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador')
  )
);
