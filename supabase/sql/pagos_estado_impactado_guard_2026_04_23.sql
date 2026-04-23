-- Garantiza columnas mínimas requeridas para registrar pagos con estado/impacto.
alter table if exists public.pagos
  add column if not exists estado text,
  add column if not exists impactado boolean not null default false;

update public.pagos
set estado = case
  when coalesce(impactado, false) = true then 'aprobado'
  else coalesce(estado, 'pendiente_aprobacion')
end
where estado is null;
