-- Asegura columnas requeridas por el flujo registrar-pago
alter table if exists public.pagos
  add column if not exists estado text default 'pendiente_aprobacion',
  add column if not exists impactado boolean not null default false,
  add column if not exists metodo text,
  add column if not exists prestamo_id uuid,
  add column if not exists cliente_id uuid,
  add column if not exists monto numeric,
  add column if not exists fecha_pago timestamptz,
  add column if not exists registrado_por uuid;
