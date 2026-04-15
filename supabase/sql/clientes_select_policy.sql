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

-- PASO 1 (solo diagnóstico temporal):
-- Esta policy deja leer todo a usuarios autenticados para confirmar si el problema era RLS.
create policy "debug_select_clientes"
on public.clientes
for select
to authenticated
using (true);

-- IMPORTANTE:
-- Verificar listado en admin-home con esta policy temporal.
-- Luego eliminarla y aplicar la policy final segura:
drop policy if exists "debug_select_clientes" on public.clientes;

create policy "allow select clientes admin"
on public.clientes
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.usuario_id = auth.uid()
      and u.rol in ('admin', 'administrador')
  )
);
