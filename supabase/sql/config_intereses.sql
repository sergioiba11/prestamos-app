create extension if not exists pgcrypto;

create table if not exists public.config_intereses (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('mensual', 'diario')),
  cuotas integer null,
  dias integer null,
  porcentaje numeric(8,2) not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists config_intereses_unique_mensual_cuotas
  on public.config_intereses (tipo, cuotas)
  ;

create or replace function public.set_config_intereses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_config_intereses_updated_at on public.config_intereses;
create trigger trg_config_intereses_updated_at
before update on public.config_intereses
for each row
execute function public.set_config_intereses_updated_at();

insert into public.config_intereses (tipo, cuotas, dias, porcentaje, activo)
values
  ('mensual', 1, null, 15, true),
  ('mensual', 2, null, 22, true),
  ('mensual', 3, null, 30, true),
  ('mensual', 4, null, 38, true),
  ('mensual', 5, null, 46, true),
  ('mensual', 6, null, 55, true),
  ('mensual', 7, null, 63, true),
  ('mensual', 8, null, 71, true),
  ('mensual', 9, null, 79, true),
  ('mensual', 10, null, 87, true),
  ('mensual', 11, null, 95, true),
  ('mensual', 12, null, 105, true),
  ('mensual', 13, null, 114, true),
  ('mensual', 14, null, 123, true),
  ('mensual', 15, null, 132, true),
  ('mensual', 16, null, 141, true),
  ('mensual', 17, null, 150, true),
  ('mensual', 18, null, 160, true),
  ('mensual', 19, null, 169, true),
  ('mensual', 20, null, 178, true),
  ('mensual', 21, null, 187, true),
  ('mensual', 22, null, 196, true),
  ('mensual', 23, null, 205, true),
  ('mensual', 24, null, 215, true),
  ('mensual', 25, null, 224, true),
  ('mensual', 26, null, 233, true),
  ('mensual', 27, null, 242, true),
  ('mensual', 28, null, 251, true),
  ('mensual', 29, null, 260, true),
  ('mensual', 30, null, 270, true),
  ('mensual', 31, null, 279, true),
  ('mensual', 32, null, 288, true),
  ('mensual', 33, null, 297, true),
  ('mensual', 34, null, 306, true),
  ('mensual', 35, null, 315, true),
  ('mensual', 36, null, 325, true)
on conflict (tipo, cuotas)
do update set
  porcentaje = excluded.porcentaje,
  activo = true,
  updated_at = now();

alter table if exists public.config_intereses enable row level security;

drop policy if exists "config_intereses_select_admin_empleado" on public.config_intereses;
create policy "config_intereses_select_admin_empleado"
on public.config_intereses
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
);

drop policy if exists "config_intereses_write_admin" on public.config_intereses;
create policy "config_intereses_write_admin"
on public.config_intereses
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) = 'admin'
  )
);
