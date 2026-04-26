create extension if not exists pgcrypto;

create table if not exists public.config_mora (
  id uuid primary key default gen_random_uuid(),
  tramo text not null unique,
  dias_desde integer not null,
  dias_hasta integer null,
  porcentaje_diario numeric(8,4) not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_config_mora_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_config_mora_updated_at on public.config_mora;
create trigger trg_config_mora_updated_at
before update on public.config_mora
for each row
execute function public.set_config_mora_updated_at();

insert into public.config_mora (tramo, dias_desde, dias_hasta, porcentaje_diario, activo)
values
  ('gracia', 1, 3, 0, true),
  ('mora_normal', 4, 10, 1, true),
  ('mora_alta', 11, null, 2, true)
on conflict (tramo)
do update set
  dias_desde = excluded.dias_desde,
  dias_hasta = excluded.dias_hasta,
  porcentaje_diario = excluded.porcentaje_diario,
  activo = true,
  updated_at = now();

alter table if exists public.config_mora enable row level security;

drop policy if exists "config_mora_select_admin_empleado" on public.config_mora;
create policy "config_mora_select_admin_empleado"
on public.config_mora
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
);

drop policy if exists "config_mora_write_admin" on public.config_mora;
create policy "config_mora_write_admin"
on public.config_mora
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) = 'admin'
  )
)
with check (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) = 'admin'
  )
);
