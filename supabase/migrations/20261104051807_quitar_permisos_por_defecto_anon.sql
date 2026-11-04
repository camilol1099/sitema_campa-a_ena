-- Supabase da por defecto a `anon` todos los permisos sobre cualquier tabla,
-- secuencia o función NUEVA del esquema public. Este sistema no tiene nada
-- público, así que se quitan: lo que se cree en adelante queda cerrado para
-- quien no tiene sesión, aunque una migración olvide hacerlo.
-- (No cambia los permisos de los objetos que ya existen.)

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- Postgres además da EXECUTE a PUBLIC (todos los roles) en toda función nueva.
-- Se quita; `authenticated` conserva su permiso por defecto en public.
alter default privileges for role postgres
  revoke execute on functions from public;
