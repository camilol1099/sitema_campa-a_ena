-- Latido: consulta mínima para que Supabase no pause el proyecto por
-- inactividad (plan gratuito: 7 días sin uso). La llama /api/latido una vez
-- al día, sin sesión. No toca ninguna tabla: solo devuelve la hora del servidor.
create or replace function public.latido()
returns timestamptz
language sql stable security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.latido() from public;
grant execute on function public.latido() to anon, authenticated;
