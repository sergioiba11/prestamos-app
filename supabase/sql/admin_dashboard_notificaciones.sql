-- CrediTodo admin dashboard + notificaciones + pagos pendientes
-- Ejecutar en orden en entorno de staging antes de producción.

create extension if not exists pgcrypto;

alter table if exists public.pagos
  add column if not exists estado_validacion text,
  add column if not exists aprobado_por uuid,
  add column if not exists aprobado_at timestamptz,
  add column if not exists observacion_validacion text;

update public.pagos
set estado_validacion =
  case
    when lower(coalesce(metodo, '')) = 'transferencia' then 'pendiente'
    else 'aprobado'
  end
where estado_validacion is null;

alter table if exists public.pagos
  alter column estado_validacion set default 'aprobado';

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  descripcion text,
  usuario_destino_id uuid,
  cliente_id uuid,
  prestamo_id uuid,
  pago_id uuid,
  leida boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_usuario_destino on public.notificaciones (usuario_destino_id);
create index if not exists idx_notificaciones_leida on public.notificaciones (leida);
create index if not exists idx_notificaciones_created_at_desc on public.notificaciones (created_at desc);

create index if not exists idx_pagos_estado_validacion on public.pagos (estado_validacion);
create index if not exists idx_pagos_metodo on public.pagos (metodo);
create index if not exists idx_pagos_cliente_created on public.pagos (cliente_id, created_at desc);
create index if not exists idx_prestamos_estado on public.prestamos (estado);
create index if not exists idx_cuotas_vencimiento_estado on public.cuotas (fecha_vencimiento, estado);

create or replace view public.admin_pagos_pendientes as
select
  p.id,
  p.cliente_id,
  c.nombre as cliente_nombre,
  c.dni as cliente_dni,
  p.prestamo_id,
  p.monto,
  p.metodo,
  p.created_at,
  p.estado_validacion
from public.pagos p
left join public.clientes c on c.id = p.cliente_id
where coalesce(lower(p.estado_validacion), 'aprobado') = 'pendiente'
order by p.created_at desc;

create or replace view public.admin_clientes_activos as
with prox_cuota as (
  select distinct on (cu.prestamo_id)
    cu.prestamo_id,
    cu.fecha_vencimiento,
    cu.saldo_pendiente
  from public.cuotas cu
  where lower(coalesce(cu.estado, '')) in ('pendiente','parcial')
  order by cu.prestamo_id, cu.fecha_vencimiento asc nulls last
)
select
  p.id as prestamo_id,
  p.cliente_id,
  c.nombre,
  c.dni,
  c.telefono,
  c.direccion,
  c.usuario_id,
  u.email,
  p.total_a_pagar,
  p.saldo_pendiente,
  p.estado,
  coalesce(pc.fecha_vencimiento, p.fecha_limite) as proximo_pago,
  p.fecha_limite
from public.prestamos p
join public.clientes c on c.id = p.cliente_id
left join public.usuarios u on u.id = c.usuario_id
left join prox_cuota pc on pc.prestamo_id = p.id
where lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora');

create or replace function public.rpc_admin_dashboard_resumen()
returns table (
  a_cobrar_hoy numeric,
  clientes_activos bigint,
  prestamos_vencidos bigint,
  pagos_pendientes bigint
)
language sql
security definer
set search_path = public
as $$
with cuotas_hoy as (
  select coalesce(sum(
    case
      when coalesce(cu.saldo_pendiente, 0) > 0 then cu.saldo_pendiente
      else greatest(coalesce(cu.monto_cuota, 0) - coalesce(cu.monto_pagado, 0), 0)
    end
  ), 0) as total
  from public.cuotas cu
  where cu.fecha_vencimiento::date = current_date
    and lower(coalesce(cu.estado, '')) in ('pendiente','parcial')
),
clientes_act as (
  select count(distinct p.cliente_id) as total
  from public.prestamos p
  where lower(coalesce(p.estado, '')) in ('activo','atrasado','en_mora')
),
prestamos_venc as (
  select count(*) as total
  from public.prestamos p
  where
    lower(coalesce(p.estado, '')) in ('atrasado','en_mora')
    or (
      p.fecha_limite::date < current_date
      and coalesce(p.saldo_pendiente, 0) > 0
    )
),
pagos_pend as (
  select count(*) as total
  from public.pagos p
  where coalesce(lower(p.estado_validacion), 'aprobado') = 'pendiente'
)
select
  (select total from cuotas_hoy),
  (select total from clientes_act),
  (select total from prestamos_venc),
  (select total from pagos_pend);
$$;

grant execute on function public.rpc_admin_dashboard_resumen() to anon, authenticated, service_role;

alter table if exists public.notificaciones enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notificaciones' and policyname = 'notificaciones_select_admin_empleado'
  ) then
    execute 'drop policy "notificaciones_select_admin_empleado" on public.notificaciones';
  end if;
end
$$;

create policy "notificaciones_select_admin_empleado"
on public.notificaciones
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin','empleado')
  )
  or usuario_destino_id = auth.uid()
);

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notificaciones' and policyname = 'notificaciones_update_read_admin_empleado'
  ) then
    execute 'drop policy "notificaciones_update_read_admin_empleado" on public.notificaciones';
  end if;
end
$$;

create policy "notificaciones_update_read_admin_empleado"
on public.notificaciones
for update
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin','empleado')
  )
  or usuario_destino_id = auth.uid()
)
with check (true);
