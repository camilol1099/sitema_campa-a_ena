-- Quita de los referentes los campos que no vienen del Excel:
-- estado (activo/inactivo), cargo (empresario) y cargo_politico (aliado).
-- Nota: vinculos.activo NO se toca (indica si el vínculo sigue vigente).

drop view public.referentes_resumen;

alter table public.referentes
  drop constraint campos_empresario,
  drop constraint campos_aliado,
  drop column estado,
  drop column cargo,
  drop column cargo_politico;

alter table public.referentes
  add constraint campos_empresario check (tipo = 'empresario' or (empresa is null and sector is null)),
  add constraint campos_aliado check (tipo = 'aliado' or (partido_movimiento is null and zona_influencia is null));

drop type public.estado_referente;

-- Vista para listas (sin dirección ni teléfono), igual que antes pero sin esos campos.
create view public.referentes_resumen
with (security_invoker = true) as
select
  r.id, r.tipo, r.nombre, r.barrio, r.meta_personas,
  r.empresa, r.sector, r.partido_movimiento,
  count(v.id) filter (where v.activo) as total_personas,
  r.updated_at
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

revoke all on public.referentes_resumen from anon;
