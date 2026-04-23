create or replace view public.admin_clientes_listado
with (security_invoker = true)
as
with prestamos_agg as (
  select
    p.cliente_id,
    count(*)::int as cantidad_prestamos,
    count(*) filter (
      where lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido', 'pendiente')
    )::int as cantidad_prestamos_activos,
    bool_or(lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido', 'pendiente')) as tiene_prestamo_activo,
    bool_or(lower(coalesce(p.estado, '')) in ('vencido', 'atrasado', 'en_mora')) as tiene_prestamo_vencido,
    sum(
      case
        when lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido', 'pendiente')
          then greatest(coalesce(p.saldo_pendiente, p.total_a_pagar, p.monto, 0), 0)
        else 0
      end
    )::numeric as deuda_activa,
    sum(greatest(coalesce(p.total_a_pagar, p.monto, 0), 0))::numeric as total_a_pagar,
    min(
      case
        when lower(coalesce(p.estado, '')) in ('activo', 'atrasado', 'en_mora', 'vencido', 'pendiente')
          then p.fecha_limite
      end
    ) as proximo_vencimiento
  from public.prestamos p
  group by p.cliente_id
),
pagos_agg as (
  select
    coalesce(pa.cliente_id, pr.cliente_id) as cliente_id,
    max(coalesce(pa.fecha_pago, pa.created_at)) as fecha_ultimo_pago,
    sum(
      case
        when lower(coalesce(pa.estado_validacion, '')) in ('aprobado', 'confirmado', 'acreditado', 'pagado')
          then coalesce(pa.monto, 0)
        when pa.estado_validacion is null and lower(coalesce(pa.metodo, '')) = 'efectivo'
          then coalesce(pa.monto, 0)
        else 0
      end
    )::numeric as total_pagado
  from public.pagos pa
  left join public.prestamos pr on pr.id = pa.prestamo_id
  group by coalesce(pa.cliente_id, pr.cliente_id)
)
select
  c.id as cliente_id,
  c.usuario_id,
  c.nombre,
  c.dni,
  coalesce((to_jsonb(c) ->> 'dni_editado')::boolean, false) as dni_editado,
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
left join pagos_agg pg on pg.cliente_id = c.id;

grant select on public.admin_clientes_listado to authenticated;
