create extension if not exists pgcrypto;

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

create index if not exists idx_actividad_sistema_created_at_desc on public.actividad_sistema (created_at desc);
create index if not exists idx_actividad_sistema_leida on public.actividad_sistema (leida);
create index if not exists idx_actividad_sistema_fijada on public.actividad_sistema (fijada);
create index if not exists idx_actividad_sistema_visible_notif on public.actividad_sistema (visible_en_notificaciones);
create index if not exists idx_actividad_sistema_tipo on public.actividad_sistema (tipo);

alter table if exists public.actividad_sistema enable row level security;

drop policy if exists "actividad_sistema_select_admin_empleado" on public.actividad_sistema;
create policy "actividad_sistema_select_admin_empleado"
on public.actividad_sistema
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
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and lower(coalesce(u.rol, '')) in ('admin', 'empleado')
  )
);

grant select, insert, update on public.actividad_sistema to authenticated;
