-- Habilita RLS y permite leer clientes (ajusta en producción según tus reglas de seguridad).
alter table public.clientes enable row level security;

drop policy if exists "allow select clientes" on public.clientes;

create policy "allow select clientes"
on public.clientes
for select
using (true);
