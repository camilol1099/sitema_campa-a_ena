-- Vistas del "Panel de avance".
-- Todas con security_invoker: corren con los permisos de quien consulta,
-- así que RLS (privado.es_admin()) sigue decidiendo qué filas se ven.
-- Ninguna expone teléfono ni dirección.
-- Desde que se quitó el estado, "referentes" son todos los referentes.

-- Por eje: referentes, personas con vínculo activo (sin repetir), suma de metas y % de avance.
create view public.panel_totales
with (security_invoker = true) as
select
  x.tipo,
  x.referentes,
  x.personas,
  x.meta_total,
  case when x.meta_total > 0 then round(100.0 * x.personas / x.meta_total, 1) end as avance
from (
  select
    t.tipo,
    (select count(*) from public.referentes r where r.tipo = t.tipo) as referentes,
    (select count(distinct v.persona_id)
       from public.vinculos v
       join public.referentes r on r.id = v.referente_id
      where v.activo and r.tipo = t.tipo) as personas,
    (select coalesce(sum(r.meta_personas), 0) from public.referentes r where r.tipo = t.tipo) as meta_total
  from unnest(enum_range(null::public.tipo_referente)) as t(tipo)
) x;

-- Por referente: personas con vínculo activo y % de avance (null si no tiene meta).
create view public.panel_referentes
with (security_invoker = true) as
select
  r.id,
  r.nombre,
  r.tipo,
  r.meta_personas,
  count(v.id) filter (where v.activo) as total_personas,
  case
    when r.meta_personas > 0
    then round(100.0 * count(v.id) filter (where v.activo) / r.meta_personas, 1)
  end as avance
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

-- Por barrio: número de personas. Las que no tienen barrio van juntas en "Sin barrio".
-- El barrio se agrupa tal como está escrito (no se unifican nombres).
create view public.panel_barrios
with (security_invoker = true) as
select
  coalesce(nullif(trim(p.barrio), ''), 'Sin barrio') as barrio,
  nullif(trim(p.barrio), '') is null as sin_barrio,
  count(*) as personas
from public.personas p
group by 1, 2;

-- Calidad de datos: una sola fila con seis conteos de personas.
create view public.panel_calidad
with (security_invoker = true) as
select
  count(*) filter (where nullif(trim(p.cedula), '') is null)          as sin_cedula,
  count(*) filter (where nullif(trim(p.barrio), '') is null)          as sin_barrio,
  count(*) filter (where nullif(trim(p.puesto_votacion), '') is null) as sin_puesto,
  count(*) filter (where p.municipio_verificacion is null)            as sin_verificar,
  count(*) filter (where c.n = 0)                                     as sin_vinculo,
  count(*) filter (where c.n >= 2)                                    as varios_referentes
from public.personas p
cross join lateral (
  select count(*) as n
  from public.vinculos v
  where v.persona_id = p.id and v.activo
) c;

-- Sin sesión no se ve nada.
revoke all on public.panel_totales    from anon;
revoke all on public.panel_referentes from anon;
revoke all on public.panel_barrios    from anon;
revoke all on public.panel_calidad    from anon;
