alter table public.clientes
  add column if not exists dni_editado boolean not null default false,
  add column if not exists dni_editado_at timestamptz,
  add column if not exists dni_original text,
  add column if not exists dni_ultimo_cambio_por uuid;

comment on column public.clientes.dni_editado is 'Marca si el DNI del cliente ya fue editado una vez.';
comment on column public.clientes.dni_editado_at is 'Fecha/hora del primer cambio de DNI realizado por admin.';
comment on column public.clientes.dni_original is 'DNI original del cliente antes del primer cambio.';
comment on column public.clientes.dni_ultimo_cambio_por is 'Usuario admin que realizó el primer cambio de DNI.';

create or replace function public.admin_update_cliente(
  p_cliente_id uuid,
  p_nombre text,
  p_apellido text default null,
  p_dni text,
  p_telefono text default null,
  p_direccion text default null
)
returns table (
  cliente_id uuid,
  dni text,
  dni_editado boolean,
  dni_editado_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_rol text;
  v_cliente public.clientes%rowtype;
  v_dni text := regexp_replace(trim(coalesce(p_dni, '')), '\\s+', '', 'g');
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_apellido text := nullif(trim(coalesce(p_apellido, '')), '');
  v_telefono text := nullif(trim(coalesce(p_telefono, '')), '');
  v_direccion text := nullif(trim(coalesce(p_direccion, '')), '');
  v_tiene_apellido boolean;
  v_dni_cambio boolean;
begin
  raise log '[admin_update_cliente] start actor=% cliente=% payload_dni=%', v_actor_id, p_cliente_id, v_dni;

  if v_actor_id is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select lower(coalesce(u.rol, ''))
    into v_actor_rol
  from public.usuarios u
  where u.id = v_actor_id;

  if v_actor_rol <> 'admin' then
    raise exception 'Solo administradores pueden editar clientes.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'Cliente inválido.';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if v_dni = '' then
    raise exception 'El DNI no puede estar vacío.';
  end if;

  if v_dni !~ '^[0-9]{6,12}$' then
    raise exception 'El DNI debe ser numérico y tener entre 6 y 12 dígitos.';
  end if;

  select c.*
    into v_cliente
  from public.clientes c
  where c.id = p_cliente_id
  for update;

  if not found then
    raise exception 'Cliente no encontrado.';
  end if;

  if exists (
    select 1
    from public.clientes c2
    where c2.id <> p_cliente_id
      and regexp_replace(trim(coalesce(c2.dni, '')), '\\s+', '', 'g') = v_dni
  ) then
    raise exception 'Ese DNI ya está en uso.';
  end if;

  v_dni_cambio := regexp_replace(trim(coalesce(v_cliente.dni, '')), '\\s+', '', 'g') <> v_dni;

  if coalesce(v_cliente.dni_editado, false) and v_dni_cambio then
    raise exception 'El DNI ya fue modificado anteriormente y no puede volver a editarse.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'apellido'
  ) into v_tiene_apellido;

  if v_tiene_apellido then
    execute '
      update public.clientes
      set nombre = $1,
          apellido = $2,
          telefono = $3,
          direccion = $4,
          dni = $5,
          dni_editado = case when $6 then true else coalesce(dni_editado, false) end,
          dni_editado_at = case when $6 then coalesce(dni_editado_at, now()) else dni_editado_at end,
          dni_original = case when $6 then coalesce(nullif(dni_original, ''''), nullif(trim($7), '''')) else dni_original end,
          dni_ultimo_cambio_por = case when $6 then coalesce(dni_ultimo_cambio_por, $8) else dni_ultimo_cambio_por end
      where id = $9
    '
    using v_nombre, v_apellido, v_telefono, v_direccion, v_dni, v_dni_cambio, v_cliente.dni, v_actor_id, p_cliente_id;
  else
    update public.clientes
    set nombre = v_nombre,
        telefono = v_telefono,
        direccion = v_direccion,
        dni = v_dni,
        dni_editado = case when v_dni_cambio then true else coalesce(dni_editado, false) end,
        dni_editado_at = case when v_dni_cambio then coalesce(dni_editado_at, now()) else dni_editado_at end,
        dni_original = case when v_dni_cambio then coalesce(nullif(dni_original, ''), nullif(trim(v_cliente.dni), '')) else dni_original end,
        dni_ultimo_cambio_por = case when v_dni_cambio then coalesce(dni_ultimo_cambio_por, v_actor_id) else dni_ultimo_cambio_por end
    where id = p_cliente_id;
  end if;

  if not v_dni_cambio
     and v_nombre = trim(coalesce(v_cliente.nombre, ''))
     and v_telefono is not distinct from nullif(trim(coalesce(v_cliente.telefono, '')), '')
     and v_direccion is not distinct from nullif(trim(coalesce(v_cliente.direccion, '')), '')
     and (not v_tiene_apellido or v_apellido is not distinct from nullif(trim(coalesce((to_jsonb(v_cliente)->>'apellido'), '')), '')) then
    raise exception 'No hay cambios para guardar.';
  end if;

  raise log '[admin_update_cliente] updated table=clientes cliente=% dni_cambio=%', p_cliente_id, v_dni_cambio;

  return query
  select c.id, c.dni, coalesce(c.dni_editado, false), c.dni_editado_at
  from public.clientes c
  where c.id = p_cliente_id;
exception
  when others then
    raise log '[admin_update_cliente] error sqlstate=% message=% detail=% hint=%', SQLSTATE, SQLERRM, PG_EXCEPTION_DETAIL, PG_EXCEPTION_HINT;
    raise;
end;
$$;

grant execute on function public.admin_update_cliente(uuid, text, text, text, text, text) to authenticated;
