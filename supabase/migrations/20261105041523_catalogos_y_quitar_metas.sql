-- 1) Quita de los referentes: meta de personas, notas, sector (empresario)
--    y partido o movimiento (aliado). El Panel deja de usar metas.
-- 2) Catálogos de barrios, municipios y puestos de votación: los formularios
--    eligen de una lista (y se puede agregar uno nuevo), para que un mismo
--    barrio no quede escrito de varias formas.
--    Las columnas siguen siendo texto (el nombre), con llave foránea al
--    catálogo: las consultas y vistas no cambian, y si un nombre del catálogo
--    se corrige, se corrige en todos los registros (on update cascade).

-- ---------- 1. quitar campos ----------
drop view public.referentes_resumen;
drop view public.panel_totales;
drop view public.panel_referentes;

alter table public.referentes
  drop constraint campos_empresario,
  drop constraint campos_aliado,
  drop column meta_personas,
  drop column notas,
  drop column sector,
  drop column partido_movimiento;

alter table public.referentes
  add constraint campos_empresario check (tipo = 'empresario' or empresa is null),
  add constraint campos_aliado check (tipo = 'aliado' or zona_influencia is null);

-- ---------- 2. catálogos ----------
-- Nombre sin espacios al inicio o al final ni espacios dobles.
create table public.barrios (
  nombre     text primary key
             check (nombre = trim(nombre) and nombre !~ '\s{2}' and length(nombre) between 2 and 80),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create table public.municipios (
  nombre     text primary key
             check (nombre = trim(nombre) and nombre !~ '\s{2}' and length(nombre) between 2 and 80),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create table public.puestos_votacion (
  nombre     text primary key
             check (nombre = trim(nombre) and nombre !~ '\s{2}' and length(nombre) between 2 and 120),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- Vacíos y espacios sobrantes se limpian antes de enlazar (si no, la llave falla).
update public.personas   set barrio = nullif(regexp_replace(trim(barrio), '\s+', ' ', 'g'), '')
  where barrio is distinct from nullif(regexp_replace(trim(barrio), '\s+', ' ', 'g'), '');
update public.referentes set barrio = nullif(regexp_replace(trim(barrio), '\s+', ' ', 'g'), '')
  where barrio is distinct from nullif(regexp_replace(trim(barrio), '\s+', ' ', 'g'), '');
update public.referentes set municipio = nullif(regexp_replace(trim(municipio), '\s+', ' ', 'g'), '')
  where municipio is distinct from nullif(regexp_replace(trim(municipio), '\s+', ' ', 'g'), '');
update public.personas   set puesto_votacion = nullif(regexp_replace(trim(puesto_votacion), '\s+', ' ', 'g'), '')
  where puesto_votacion is distinct from nullif(regexp_replace(trim(puesto_votacion), '\s+', ' ', 'g'), '');

-- Lista inicial: lo que ya hay escrito en la base.
insert into public.barrios (nombre)
  select barrio from public.personas where barrio is not null
  union
  select barrio from public.referentes where barrio is not null;
insert into public.municipios (nombre)
  select municipio from public.referentes where municipio is not null
  union
  select 'Valledupar';
insert into public.puestos_votacion (nombre)
  select distinct puesto_votacion from public.personas where puesto_votacion is not null;

alter table public.personas
  add constraint personas_barrio_fk foreign key (barrio)
    references public.barrios (nombre) on update cascade,
  add constraint personas_puesto_fk foreign key (puesto_votacion)
    references public.puestos_votacion (nombre) on update cascade;
alter table public.referentes
  add constraint referentes_barrio_fk foreign key (barrio)
    references public.barrios (nombre) on update cascade,
  add constraint referentes_municipio_fk foreign key (municipio)
    references public.municipios (nombre) on update cascade;

create index referentes_barrio_idx    on public.referentes (barrio);
create index referentes_municipio_idx on public.referentes (municipio);
create index personas_puesto_idx      on public.personas (puesto_votacion);
create index barrios_created_by_idx          on public.barrios (created_by);
create index municipios_created_by_idx       on public.municipios (created_by);
create index puestos_votacion_created_by_idx on public.puestos_votacion (created_by);

alter table public.barrios          enable row level security;
alter table public.municipios       enable row level security;
alter table public.puestos_votacion enable row level security;

create policy "admins gestionan barrios" on public.barrios
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admins gestionan municipios" on public.municipios
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admins gestionan puestos" on public.puestos_votacion
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));

revoke all on public.barrios, public.municipios, public.puestos_votacion from anon;

-- ---------- 3. vistas sin metas ----------
create view public.referentes_resumen
with (security_invoker = true) as
select
  r.id, r.tipo, r.nombre, r.barrio,
  r.empresa, r.zona_influencia,
  count(v.id) filter (where v.activo) as total_personas,
  r.updated_at
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

-- Por eje: referentes y personas con vínculo activo (sin repetir).
create view public.panel_totales
with (security_invoker = true) as
select
  t.tipo,
  (select count(*) from public.referentes r where r.tipo = t.tipo) as referentes,
  (select count(distinct v.persona_id)
     from public.vinculos v
     join public.referentes r on r.id = v.referente_id
    where v.activo and r.tipo = t.tipo) as personas
from unnest(enum_range(null::public.tipo_referente)) as t(tipo);

-- Por referente: personas con vínculo activo.
create view public.panel_referentes
with (security_invoker = true) as
select
  r.id,
  r.nombre,
  r.tipo,
  count(v.id) filter (where v.activo) as total_personas
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

revoke all on public.referentes_resumen from anon;
revoke all on public.panel_totales      from anon;
revoke all on public.panel_referentes   from anon;
