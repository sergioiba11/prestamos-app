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

create policy "clientes_select_owner_or_admin"
on public.clientes
for select
to authenticated
using (
  -- Usuario dueño de la fila.
  (
    usuario_id is not null
    and usuario_id::text = auth.uid()::text
  )
  -- Admin (opcional): ve todo si su rol en public.usuarios lo habilita.
  or exists (
    select 1
    from public.usuarios u
    where u.id::text = auth.uid()::text
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador')
  )
);

-- =========================
-- DIAGNÓSTICO (ejecutar autenticado con el usuario real)
-- =========================
-- 1) Quién soy en esta sesión:
-- select auth.uid() as auth_uid;
--
-- 2) Estructura clave de public.clientes:
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'clientes'
--   and column_name in ('id', 'usuario_id')
-- order by column_name;
--
-- 3) Cantidad de clientes por usuario_id:
-- select usuario_id, count(*) as cantidad
-- from public.clientes
-- group by usuario_id
-- order by cantidad desc;
--
-- 4) Filas con usuario_id null:
-- select count(*) as clientes_sin_usuario
-- from public.clientes
-- where usuario_id is null;
--
-- 5) Resultado real de RLS para el usuario autenticado:
-- select count(*) as clientes_visibles_con_rls
-- from public.clientes;
--
-- 6) Verificación rápida de rol del usuario autenticado:
-- select id, email, rol
-- from public.usuarios
-- where id::text = auth.uid()::text;

-- =========================
-- CORRECCIÓN OPCIONAL DE DATOS (manual)
-- =========================
-- Si hay clientes sin usuario_id y sabés a qué usuario pertenecen:
-- update public.clientes
-- set usuario_id = '<UUID_DEL_USUARIO>'
-- where id in ('<CLIENTE_ID_1>', '<CLIENTE_ID_2>');
--
-- Si necesitás revisar posibles IDs inválidos (clientes sin match en usuarios):
-- select c.id as cliente_id, c.usuario_id
-- from public.clientes c
-- left join public.usuarios u on u.id::text = c.usuario_id::text
-- where c.usuario_id is not null
--   and u.id is null;
