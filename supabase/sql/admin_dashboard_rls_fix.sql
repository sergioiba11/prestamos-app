-- Verificación rápida de estado (ejecutar primero)
select 'panel_clientes' as objeto, relrowsecurity as rls_habilitado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'panel_clientes'
union all
select 'clientes', relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'clientes'
union all
select 'usuarios', relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'usuarios'
union all
select 'prestamos', relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'prestamos';

-- Asegura FK requerida por integridad
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prestamos_cliente_id_fkey'
  ) THEN
    ALTER TABLE public.prestamos
    ADD CONSTRAINT prestamos_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);
  END IF;
END $$;

-- RLS mínimo para panel admin (admin/empleado)
ALTER TABLE IF EXISTS public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_select_admin_empleado ON public.clientes;
CREATE POLICY clientes_select_admin_empleado
ON public.clientes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND lower(coalesce(u.rol, '')) IN ('admin', 'administrador', 'empleado')
  )
);

DROP POLICY IF EXISTS prestamos_select_admin_empleado ON public.prestamos;
CREATE POLICY prestamos_select_admin_empleado
ON public.prestamos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND lower(coalesce(u.rol, '')) IN ('admin', 'administrador', 'empleado')
  )
);

DROP POLICY IF EXISTS usuarios_select_admin_empleado ON public.usuarios;
CREATE POLICY usuarios_select_admin_empleado
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND lower(coalesce(u.rol, '')) IN ('admin', 'administrador', 'empleado')
  )
);

-- Si panel_clientes es VIEW, delega permisos al usuario invocador (Postgres 15+)
DO $$
DECLARE
  panel_kind "char";
BEGIN
  SELECT c.relkind
  INTO panel_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'panel_clientes';

  IF panel_kind = 'v' THEN
    EXECUTE 'ALTER VIEW public.panel_clientes SET (security_invoker = true)';
  END IF;
END $$;

-- Permisos básicos para consumo desde frontend autenticado
GRANT SELECT ON public.panel_clientes TO authenticated;
GRANT SELECT ON public.clientes TO authenticated;
GRANT SELECT ON public.prestamos TO authenticated;
GRANT SELECT ON public.usuarios TO authenticated;
