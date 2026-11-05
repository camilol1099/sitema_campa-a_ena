-- Búsqueda por cédula.
-- 1) referentes_resumen trae la cédula, para filtrar la lista de referentes
--    por nombre o por cédula (no se muestra en la lista).
-- 2) buscar_personas acepta la cédula con puntos, comas o espacios
--    ("1.065.100.001") y cualquier parte de ella, no solo los últimos dígitos.
--    Primero salen las que terminan en lo escrito, luego las que empiezan,
--    luego las que lo contienen.

create or replace view public.referentes_resumen
with (security_invoker = true) as
select
  r.id, r.tipo, r.nombre, r.barrio,
  r.empresa, r.zona_influencia,
  count(v.id) filter (where v.activo) as total_personas,
  r.updated_at,
  r.cedula
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

revoke all on public.referentes_resumen from anon;

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
      -- solo dígitos, separados (o no) por puntos, comas, espacios o guiones
      trim(coalesce(p_texto, '')) ~ '^[0-9][0-9 .,''-]*$' as es_numero,
      regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g') as digitos
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
  where (
      patron.es_numero and length(patron.digitos) >= 3
      and p.cedula like '%' || patron.digitos || '%'
    )
    or (
      not patron.es_numero and length(patron.t) >= 2
      and public.sin_tildes(p.nombre) like '%' || patron.nombre_seguro || '%'
    )
  order by
    case
      when not patron.es_numero then 0
      when p.cedula = patron.digitos then 0
      when p.cedula like '%' || patron.digitos then 1
      when p.cedula like patron.digitos || '%' then 2
      else 3
    end,
    p.nombre
  limit 8;
$$;

revoke all on function public.buscar_personas(text) from public, anon;
grant execute on function public.buscar_personas(text) to authenticated;
