-- Fix RPC used by /cliente/[id] edit screen.
-- Ensures parameter names match exactly what frontend sends.

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
  select *
    into v_cliente
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
    dni_editado = v_dni_editado_final
  where id = p_cliente_id;

  select *
    into v_usuario
  from public.usuarios
  where usuario_id = v_cliente.usuario_id;

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

grant execute on function public.admin_update_cliente(uuid, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
