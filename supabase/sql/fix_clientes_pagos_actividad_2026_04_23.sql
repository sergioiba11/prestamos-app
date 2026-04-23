-- Fix integral (clientes + pagos + actividad/notificaciones)
-- Ejecutar en Supabase SQL editor.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- A) RPC edición de cliente + columnas auxiliares
-- =========================================================
alter table if exists public.clientes
  add column if not exists dni_editado boolean not null default false,
  add column if not exists dni_editado_at timestamptz;

update public.clientes
set dni_editado = false
where dni_editado is null;

create or replace function public.admin_update_cliente(
  p_cliente_id uuid,
  p_nombre text,
  p_apellido text,
  p_dni text,
  p_telefono text,
  p_direccion text
)
returns table (
  id uuid,
  nombre text,
  apellido text,
  dni text,
  telefono text,
  direccion text,
  email text,
  usuario_id uuid,
  rol text,
  dni_editado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes%rowtype;
  v_usuario public.usuarios%rowtype;
  v_dni_final text;
  v_dni_editado_final boolean;
  v_nombre_final text;
  v_apellido_final text;
  v_telefono_final text;
  v_direccion_final text;
begin
  select * into v_cliente
  from public.clientes
  where id = p_cliente_id
  for update;

  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  v_nombre_final := trim(coalesce(p_nombre, ''));
  v_apellido_final := nullif(trim(coalesce(p_apellido, '')), '');
  v_telefono_final := nullif(trim(coalesce(p_telefono, '')), '');
  v_direccion_final := nullif(trim(coalesce(p_direccion, '')), '');
  v_dni_final := nullif(trim(coalesce(p_dni, '')), '');

  if v_nombre_final = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if v_dni_final is null then
    v_dni_final := nullif(trim(coalesce(v_cliente.dni, '')), '');
  end if;

  if v_dni_final is null then
    raise exception 'El DNI es obligatorio';
  end if;

  if coalesce(v_cliente.dni, '') is distinct from v_dni_final then
    if coalesce(v_cliente.dni_editado, false) then
      raise exception 'El DNI solo puede modificarse una vez';
    end if;
    v_dni_editado_final := true;
  else
    v_dni_editado_final := coalesce(v_cliente.dni_editado, false);
  end if;

  if v_nombre_final is not distinct from trim(coalesce(v_cliente.nombre, ''))
    and v_apellido_final is not distinct from nullif(trim(coalesce(v_cliente.apellido, '')), '')
    and v_dni_final is not distinct from nullif(trim(coalesce(v_cliente.dni, '')), '')
    and v_telefono_final is not distinct from nullif(trim(coalesce(v_cliente.telefono, '')), '')
    and v_direccion_final is not distinct from nullif(trim(coalesce(v_cliente.direccion, '')), '') then
    raise exception 'No hay cambios para guardar';
  end if;

  update public.clientes
  set
    nombre = v_nombre_final,
    apellido = v_apellido_final,
    dni = v_dni_final,
    telefono = v_telefono_final,
    direccion = v_direccion_final,
    dni_editado = v_dni_editado_final,
    dni_editado_at = case
      when coalesce(v_cliente.dni, '') is distinct from v_dni_final and v_cliente.dni_editado_at is null then now()
      else v_cliente.dni_editado_at
    end
  where id = p_cliente_id;

  select * into v_usuario
  from public.usuarios
  where id = v_cliente.usuario_id;

  return query
  select
    c.id,
    c.nombre,
    c.apellido,
    c.dni,
    c.telefono,
    c.direccion,
    coalesce(v_usuario.email, '') as email,
    c.usuario_id,
    coalesce(v_usuario.rol, 'cliente') as rol,
    coalesce(c.dni_editado, false) as dni_editado
  from public.clientes c
  where c.id = p_cliente_id;
end;
$$;

grant execute on function public.admin_update_cliente(uuid, text, text, text, text, text) to authenticated, service_role;

-- =========================================================
-- B) Flujo de pagos: estructura mínima requerida
-- =========================================================
alter table if exists public.pagos
  add column if not exists estado text default 'pendiente_aprobacion',
  add column if not exists estado_validacion text default 'pendiente',
  add column if not exists impactado boolean not null default false,
  add column if not exists aprobado_por uuid,
  add column if not exists aprobado_at timestamptz,
  add column if not exists rechazado_por uuid,
  add column if not exists rechazado_at timestamptz,
  add column if not exists observacion_revision text;

alter table if exists public.cuotas
  add column if not exists monto_pagado numeric not null default 0,
  add column if not exists saldo_pendiente numeric,
  add column if not exists fecha_pago timestamptz;

alter table if exists public.prestamos
  add column if not exists estado text default 'activo';

create table if not exists public.pagos_detalle (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  prestamo_id uuid not null references public.prestamos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  numero_cuota integer not null,
  monto_aplicado numeric not null default 0,
  saldo_cuota_antes numeric not null default 0,
  saldo_cuota_despues numeric not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists pagos_detalle_pago_cuota_unique
  on public.pagos_detalle (pago_id, cuota_id);

-- =========================================================
-- C) Actividad y notificaciones
-- =========================================================
create table if not exists public.actividad_sistema (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  descripcion text null,
  entidad_tipo text null,
  entidad_id uuid null,
  usuario_id uuid null,
  usuario_nombre text null,
  prioridad text not null default 'normal' check (prioridad in ('normal','alta','critica')),
  fijada boolean not null default false,
  leida boolean not null default false,
  visible_en_notificaciones boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

alter table if exists public.actividad_sistema enable row level security;
alter table if exists public.notificaciones enable row level security;

drop policy if exists "actividad_sistema_select_admin_empleado" on public.actividad_sistema;
create policy "actividad_sistema_select_admin_empleado"
on public.actividad_sistema
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
);

drop policy if exists "actividad_sistema_insert_authenticated" on public.actividad_sistema;
create policy "actividad_sistema_insert_authenticated"
on public.actividad_sistema
for insert
to authenticated
with check (
  auth.uid() is not null
  and (usuario_id is null or usuario_id = auth.uid())
);

drop policy if exists "actividad_sistema_update_admin_empleado" on public.actividad_sistema;
create policy "actividad_sistema_update_admin_empleado"
on public.actividad_sistema
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
)
with check (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
);

drop policy if exists "notificaciones_select_admin_empleado" on public.notificaciones;
create policy "notificaciones_select_admin_empleado"
on public.notificaciones
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin','empleado')
  )
  or usuario_destino_id = auth.uid()
);

drop policy if exists "notificaciones_update_read_admin_empleado" on public.notificaciones;
create policy "notificaciones_update_read_admin_empleado"
on public.notificaciones
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin','empleado')
  )
  or usuario_destino_id = auth.uid()
)
with check (true);

grant select, insert, update on public.actividad_sistema to authenticated, service_role;
grant select, insert, update on public.notificaciones to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
