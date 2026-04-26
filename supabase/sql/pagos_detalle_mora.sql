alter table if exists public.pagos_detalle
  add column if not exists dias_mora integer not null default 0,
  add column if not exists porcentaje_mora numeric(8,4) not null default 0,
  add column if not exists monto_mora numeric(12,2) not null default 0,
  add column if not exists total_con_mora numeric(12,2) not null default 0;
