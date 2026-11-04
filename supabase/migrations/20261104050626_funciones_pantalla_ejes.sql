-- Funciones de consulta para la pantalla de ejes.
-- Todas son security invoker: corren con los permisos de quien llama,
-- así que RLS (privado.es_admin()) sigue protegiendo los datos.

-- Quita tildes y pasa a minúsculas para comparar nombres ("Jesus" = "Jesús").
create or replace function public.sin_tildes(p_texto text)
returns text
language sql immutable
set search_path = ''
as $$
  select translate(lower(p_texto), 'áéíóúüñàèìòù', 'aeiouunaeiou');
$$;

-- Cifras de un eje (líderes, empresarios o aliados).
create or replace function public.cifras_eje(p_tipo public.tipo_referente)
returns table (
  personas_eje      bigint,
  total_personas    bigint,
  votan_valledupar  bigint,
  por_completar     bigint,
  en_otro_eje       bigint
)
language sql stable security invoker
set search_path = ''
as $$
  with del_eje as (
    select distinct v.persona_id
    from public.vinculos v
    join public.referentes r on r.id = v.referente_id
    where v.activo and r.tipo = p_tipo
  )
  select
    (select count(*) from del_eje),
    (select count(*) from public.personas),
    (select count(*) from del_eje d join public.personas p on p.id = d.persona_id
      where p.municipio_verificacion = 'Valledupar'),
    (select count(*) from del_eje d join public.personas p on p.id = d.persona_id
      where p.cedula is null
         or nullif(trim(p.barrio), '') is null
         or p.municipio_verificacion is null),
    (select count(*) from del_eje d
      where exists (
        select 1 from public.vinculos v2
        join public.referentes r2 on r2.id = v2.referente_id
        where v2.persona_id = d.persona_id and v2.activo and r2.tipo <> p_tipo
      ));
$$;

-- Personas de un referente, con lo necesario para el árbol y sus alertas.
-- No devuelve cédula, celular ni dirección: solo si falta la cédula.
create or replace function public.personas_de_referente(p_referente uuid)
returns table (
  id                      uuid,
  nombre                  text,
  barrio                  text,
  puesto_votacion         text,
  coordinador             text,
  sin_cedula              boolean,
  municipio_verificacion  public.verificacion_municipio,
  num_referentes          bigint
)
language sql stable security invoker
set search_path = ''
as $$
  select
    p.id, p.nombre, p.barrio, p.puesto_votacion, v.coordinador,
    p.cedula is null,
    p.municipio_verificacion,
    (select count(*) from public.vinculos v2 where v2.persona_id = p.id and v2.activo)
  from public.vinculos v
  join public.personas p on p.id = v.persona_id
  where v.referente_id = p_referente and v.activo
  order by p.nombre;
$$;

-- Búsqueda global: por nombre (sin importar tildes) o por los últimos dígitos de la cédula.
-- Devuelve solo los últimos 4 dígitos de la cédula y el primer referente activo.
create or replace function public.buscar_personas(p_texto text)
returns table (
  id               uuid,
  nombre           text,
  cedula_final     text,
  barrio           text,
  referente_id     uuid,
  referente_tipo   public.tipo_referente,
  referente_nombre text
)
language sql stable security invoker
set search_path = ''
as $$
  with q as (
    select
      trim(coalesce(p_texto, '')) as t,
      trim(coalesce(p_texto, '')) ~ '^[0-9]+$' as es_numero
  ),
  patron as (
    -- se escapan los comodines de LIKE para que el texto se busque literal
    select
      q.*,
      replace(replace(replace(public.sin_tildes(q.t), '\', '\\'), '%', '\%'), '_', '\_') as nombre_seguro
    from q
  )
  select
    p.id, p.nombre, right(p.cedula, 4), p.barrio,
    r.id, r.tipo, r.nombre
  from public.personas p
  cross join patron
  left join lateral (
    select r.id, r.tipo, r.nombre
    from public.vinculos v
    join public.referentes r on r.id = v.referente_id
    where v.persona_id = p.id and v.activo
    order by v.fecha_vinculo, v.created_at
    limit 1
  ) r on true
  where length(patron.t) >= 2
    and (
      (patron.es_numero and p.cedula like '%' || patron.t)
      or public.sin_tildes(p.nombre) like '%' || patron.nombre_seguro || '%'
    )
  order by (patron.es_numero and p.cedula like '%' || patron.t) desc, p.nombre
  limit 8;
$$;

-- Permisos: solo usuarios con sesión; RLS decide qué filas ven.
revoke all on function public.sin_tildes(text)                      from public, anon;
revoke all on function public.cifras_eje(public.tipo_referente)     from public, anon;
revoke all on function public.personas_de_referente(uuid)           from public, anon;
revoke all on function public.buscar_personas(text)                 from public, anon;
grant execute on function public.sin_tildes(text)                   to authenticated;
grant execute on function public.cifras_eje(public.tipo_referente)  to authenticated;
grant execute on function public.personas_de_referente(uuid)        to authenticated;
grant execute on function public.buscar_personas(text)              to authenticated;
