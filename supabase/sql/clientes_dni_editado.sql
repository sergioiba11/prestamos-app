alter table public.clientes
  add column if not exists dni_editado boolean not null default false;

comment on column public.clientes.dni_editado is 'Indica si el DNI del cliente ya fue modificado al menos una vez.';
