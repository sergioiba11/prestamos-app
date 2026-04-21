-- Fuente de verdad plana para panel/listado administrativo
create or replace view public.admin_clientes_listado
with (security_invoker = true)
as
with prestamos_agg as (
  select
    p.cliente_id,
    count(*)::int as cantidad_prestamos,
    count(*) filter (where lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido'))::int as cantidad_prestamos_activos,
    bool_or(lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido')) as tiene_prestamo_activo,
    bool_or(lower(coalesce(p.estado, '')) = 'vencido') as tiene_prestamo_vencido,
    sum(
      case
        when lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido')
          then greatest(coalesce(p.saldo_pendiente, p.total_a_pagar, p.monto, 0), 0)
        else 0
      end
    )::numeric as deuda_activa,
    sum(greatest(coalesce(p.total_a_pagar, p.monto, 0), 0))::numeric as total_a_pagar,
    min(
      case
        when lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido') then p.fecha_limite
      end
    ) as proximo_vencimiento
  from public.prestamos p
  group by p.cliente_id
),
pagos_agg as (
  select
    pa.cliente_id,
    max(pa.fecha_pago) as fecha_ultimo_pago,
    sum(
      case
        when lower(coalesce(pa.estado_validacion, 'aprobado')) in ('aprobado', 'confirmado', 'acreditado')
          then coalesce(pa.monto, 0)
        when pa.estado_validacion is null and lower(coalesce(pa.estado, '')) = 'completado'
          then coalesce(pa.monto, 0)
        else 0
      end
    )::numeric as total_pagado
  from public.pagos pa
  group by pa.cliente_id
)
select
  c.id as cliente_id,
  c.usuario_id,
  c.nombre,
  c.dni,
  c.telefono,
  c.direccion,
  u.email,
  coalesce(pr.cantidad_prestamos, 0) as cantidad_prestamos,
  coalesce(pr.cantidad_prestamos_activos, 0) as cantidad_prestamos_activos,
  coalesce(pr.tiene_prestamo_activo, false) as tiene_prestamo_activo,
  coalesce(pr.tiene_prestamo_vencido, false) as tiene_prestamo_vencido,
  coalesce(pr.deuda_activa, 0)::numeric as deuda_activa,
  coalesce(pg.total_pagado, 0)::numeric as total_pagado,
  greatest(coalesce(pr.total_a_pagar, 0) - coalesce(pg.total_pagado, 0), 0)::numeric as restante,
  pr.proximo_vencimiento,
  pg.fecha_ultimo_pago,
  case
    when coalesce(pr.tiene_prestamo_vencido, false) then 'vencido'
    when coalesce(pr.tiene_prestamo_activo, false) then 'activo'
    else 'sin_prestamo'
  end as estado_cliente
from public.clientes c
left join public.usuarios u on u.id = c.usuario_id
left join prestamos_agg pr on pr.cliente_id = c.id
left join pagos_agg pg on pg.cliente_id = c.id
where c.usuario_id is not null;

grant select on public.admin_clientes_listado to authenticated;

alter table if exists public.clientes enable row level security;
alter table if exists public.usuarios enable row level security;
alter table if exists public.prestamos enable row level security;
alter table if exists public.pagos enable row level security;
alter table if exists public.cuotas enable row level security;

drop policy if exists admin_read_clientes on public.clientes;
create policy admin_read_clientes on public.clientes
for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador', 'empleado')
  )
);

drop policy if exists admin_read_usuarios on public.usuarios;
create policy admin_read_usuarios on public.usuarios
for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador', 'empleado')
  )
);

drop policy if exists admin_read_prestamos on public.prestamos;
create policy admin_read_prestamos on public.prestamos
for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador', 'empleado')
  )
);

drop policy if exists admin_read_pagos on public.pagos;
create policy admin_read_pagos on public.pagos
for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador', 'empleado')
  )
);

drop policy if exists admin_read_cuotas on public.cuotas;
create policy admin_read_cuotas on public.cuotas
for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'administrador', 'empleado')
  )
);
