-- Asistente de IA: importaciones por lote y consultas de apoyo.
--
-- 1) Tabla `importaciones` (un registro por lote importado desde el asistente).
-- 2) Columna `lote_id` en referentes, personas y vinculos.
-- 3) public.soy_admin(): para que el servidor confirme que quien llama es admin.
-- 4) public.importar_lote(): guarda un lote completo en una sola transacción.
-- 5) public.deshacer_lote(): borra lo creado por un lote si no cambió después.
-- 6) public.personas_con_problemas(): consulta para la herramienta del asistente.
--
-- Todas las funciones son security invoker: corren con los permisos de quien
-- llama, así que RLS (privado.es_admin()) sigue decidiendo qué se ve y se cambia.

-- ---------- 1. importaciones ----------
create table public.importaciones (
  id             uuid primary key default gen_random_uuid(),
  archivo_nombre text not null check (length(trim(archivo_nombre)) between 1 and 200),
  tipo           text not null check (tipo in ('persona', 'lider', 'empresario', 'aliado')),
  filas_creadas  integer not null default 0 check (filas_creadas >= 0),
  creado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  deshecha_at    timestamptz
);
create index importaciones_creado_por_idx on public.importaciones (creado_por);

alter table public.importaciones enable row level security;
create policy "admins gestionan importaciones" on public.importaciones
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
revoke all on public.importaciones from anon;
-- Las funciones de abajo son security invoker: necesitan insert/update como
-- `authenticated`; RLS limita todo a la administradora. Borrar no se permite
-- (el lote queda como registro aunque se deshaga).
revoke delete on public.importaciones from authenticated;

-- ---------- 2. lote_id ----------
alter table public.referentes add column lote_id uuid references public.importaciones (id) on delete set null;
alter table public.personas   add column lote_id uuid references public.importaciones (id) on delete set null;
alter table public.vinculos   add column lote_id uuid references public.importaciones (id) on delete set null;
create index referentes_lote_idx on public.referentes (lote_id);
create index personas_lote_idx   on public.personas (lote_id);
create index vinculos_lote_idx   on public.vinculos (lote_id);

-- ---------- 3. soy_admin ----------
create or replace function public.soy_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select privado.es_admin();
$$;

-- ---------- 4. importar_lote ----------
-- Recibe los registros ya validados por el servidor (Server Action) y los
-- guarda todos o ninguno. Si una cédula ya existe, la llave única hace fallar
-- todo el lote y no queda nada a medias.
-- p_referentes / p_personas / p_vinculos: arreglos JSON con las columnas de
-- cada tabla (los id los genera el servidor para poder enlazar los vínculos).
create or replace function public.importar_lote(
  p_archivo    text,
  p_tipo       text,
  p_barrios    text[],
  p_puestos    text[],
  p_municipios text[],
  p_referentes jsonb,
  p_personas   jsonb,
  p_vinculos   jsonb
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_lote uuid;
  v_ref  integer;
  v_per  integer;
begin
  if not privado.es_admin() then
    raise exception 'Solo la administradora puede importar' using errcode = '42501';
  end if;

  -- creado_por = auth.uid() (valor por defecto).
  insert into public.importaciones (archivo_nombre, tipo)
  values (p_archivo, p_tipo)
  returning id into v_lote;

  insert into public.barrios (nombre)
    select distinct unnest(coalesce(p_barrios, '{}')) on conflict (nombre) do nothing;
  insert into public.puestos_votacion (nombre)
    select distinct unnest(coalesce(p_puestos, '{}')) on conflict (nombre) do nothing;
  insert into public.municipios (nombre)
    select distinct unnest(coalesce(p_municipios, '{}')) on conflict (nombre) do nothing;

  insert into public.referentes (
    id, tipo, nombre, cedula, celular, direccion, barrio, municipio,
    puesto_votacion, mesa, municipio_verificacion, coordinador,
    empresa, zona_influencia, lote_id
  )
  select
    r.id, r.tipo, r.nombre, r.cedula, r.celular, r.direccion, r.barrio, r.municipio,
    r.puesto_votacion, r.mesa, r.municipio_verificacion, r.coordinador,
    r.empresa, r.zona_influencia, v_lote
  from jsonb_populate_recordset(null::public.referentes, coalesce(p_referentes, '[]')) r;
  get diagnostics v_ref = row_count;

  insert into public.personas (
    id, nombre, cedula, celular, direccion, barrio, municipio_verificacion,
    puesto_votacion, mesa, observaciones, autorizacion_datos, fecha_autorizacion,
    origen, lote_id
  )
  select
    p.id, p.nombre, p.cedula, p.celular, p.direccion, p.barrio, p.municipio_verificacion,
    p.puesto_votacion, p.mesa, p.observaciones, coalesce(p.autorizacion_datos, false), p.fecha_autorizacion,
    'manual', v_lote
  from jsonb_populate_recordset(null::public.personas, coalesce(p_personas, '[]')) p;
  get diagnostics v_per = row_count;

  insert into public.vinculos (persona_id, referente_id, coordinador, lote_id)
  select v.persona_id, v.referente_id, v.coordinador, v_lote
  from jsonb_populate_recordset(null::public.vinculos, coalesce(p_vinculos, '[]')) v;

  update public.importaciones set filas_creadas = v_ref + v_per where id = v_lote;

  return v_lote;
end;
$$;

-- ---------- 5. deshacer_lote ----------
-- Borra los vínculos, personas y referentes creados por el lote.
-- No toca un registro si:
--   - se editó después de importarlo (historial con acción distinta de crear/vincular),
--   - es una persona o referente del lote con vínculos que no son del lote,
--   - está unido por un vínculo del lote a un registro que no se puede borrar.
-- Devuelve lo que borró y la lista de lo que dejó (con el motivo).
-- Si no quedó nada bloqueado, marca el lote como deshecho.
create or replace function public.deshacer_lote(p_lote uuid)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_imp       public.importaciones;
  v_per_bloq  uuid[];
  v_ref_bloq  uuid[];
  v_vin_bloq  uuid[];
  v_cambio    boolean := true;
  v_n_vin     integer;
  v_n_per     integer;
  v_n_ref     integer;
  v_bloqueados jsonb;
begin
  if not privado.es_admin() then
    raise exception 'Solo la administradora puede deshacer un lote' using errcode = '42501';
  end if;

  select * into v_imp from public.importaciones where id = p_lote for update;
  if not found then
    raise exception 'No existe ese lote' using errcode = 'P0002';
  end if;
  if v_imp.deshecha_at is not null then
    return jsonb_build_object('ya_deshecho', true);
  end if;

  -- Bloqueo directo: editado después, o con vínculos que no son del lote.
  select coalesce(array_agg(p.id), '{}') into v_per_bloq
  from public.personas p
  where p.lote_id = p_lote
    and (
      exists (select 1 from public.historial h
              where h.tabla = 'personas' and h.registro_id = p.id
                and h.accion not in ('crear', 'vincular'))
      or exists (select 1 from public.vinculos v
                 where v.persona_id = p.id and v.lote_id is distinct from p_lote)
    );

  select coalesce(array_agg(r.id), '{}') into v_ref_bloq
  from public.referentes r
  where r.lote_id = p_lote
    and (
      exists (select 1 from public.historial h
              where h.tabla = 'referentes' and h.registro_id = r.id
                and h.accion not in ('crear', 'vincular'))
      or exists (select 1 from public.vinculos v
                 where v.referente_id = r.id and v.lote_id is distinct from p_lote)
    );

  select coalesce(array_agg(v.id), '{}') into v_vin_bloq
  from public.vinculos v
  where v.lote_id = p_lote
    and exists (select 1 from public.historial h
                where h.tabla = 'vinculos' and h.registro_id = v.id
                  and h.accion not in ('crear', 'vincular'));

  -- Propaga el bloqueo por los vínculos del lote hasta que no cambie nada
  -- (borrar un registro borraría en cascada un vínculo que debe quedarse).
  while v_cambio loop
    v_cambio := false;

    -- vínculos unidos a una persona o referente bloqueado
    with nuevos as (
      select v.id from public.vinculos v
      where v.lote_id = p_lote
        and not (v.id = any (v_vin_bloq))
        and (v.persona_id = any (v_per_bloq) or v.referente_id = any (v_ref_bloq))
    )
    select v_vin_bloq || coalesce(array_agg(id), '{}'), count(*) > 0 or v_cambio
      into v_vin_bloq, v_cambio from nuevos;

    -- personas y referentes del lote unidos a un vínculo bloqueado
    with nuevas as (
      select p.id from public.personas p
      join public.vinculos v on v.persona_id = p.id
      where p.lote_id = p_lote and v.id = any (v_vin_bloq) and not (p.id = any (v_per_bloq))
    )
    select v_per_bloq || coalesce(array_agg(distinct id), '{}'), count(*) > 0 or v_cambio
      into v_per_bloq, v_cambio from nuevas;

    with nuevos as (
      select r.id from public.referentes r
      join public.vinculos v on v.referente_id = r.id
      where r.lote_id = p_lote and v.id = any (v_vin_bloq) and not (r.id = any (v_ref_bloq))
    )
    select v_ref_bloq || coalesce(array_agg(distinct id), '{}'), count(*) > 0 or v_cambio
      into v_ref_bloq, v_cambio from nuevos;
  end loop;

  -- Lista de lo que se deja, con el motivo (antes de borrar lo demás).
  select coalesce(jsonb_agg(b), '[]') into v_bloqueados
  from (
    select 'persona' as tipo, p.id, p.nombre,
      case
        when exists (select 1 from public.historial h where h.tabla = 'personas' and h.registro_id = p.id
                       and h.accion not in ('crear', 'vincular')) then 'se editó después de importarla'
        when exists (select 1 from public.vinculos v where v.persona_id = p.id
                       and v.lote_id is distinct from p_lote) then 'tiene vínculos que no son de este lote'
        else 'está unida a un registro que cambió'
      end as motivo
    from public.personas p where p.id = any (v_per_bloq)
    union all
    select r.tipo::text, r.id, r.nombre,
      case
        when exists (select 1 from public.historial h where h.tabla = 'referentes' and h.registro_id = r.id
                       and h.accion not in ('crear', 'vincular')) then 'se editó después de importarlo'
        when exists (select 1 from public.vinculos v where v.referente_id = r.id
                       and v.lote_id is distinct from p_lote) then 'tiene personas que no son de este lote'
        else 'está unido a un registro que cambió'
      end
    from public.referentes r where r.id = any (v_ref_bloq)
  ) b;

  delete from public.vinculos
  where lote_id = p_lote and not (id = any (v_vin_bloq));
  get diagnostics v_n_vin = row_count;

  delete from public.personas
  where lote_id = p_lote and not (id = any (v_per_bloq));
  get diagnostics v_n_per = row_count;

  delete from public.referentes
  where lote_id = p_lote and not (id = any (v_ref_bloq));
  get diagnostics v_n_ref = row_count;

  if jsonb_array_length(v_bloqueados) = 0 then
    update public.importaciones set deshecha_at = now() where id = p_lote;
  end if;

  return jsonb_build_object(
    'vinculos_borrados',   v_n_vin,
    'personas_borradas',   v_n_per,
    'referentes_borrados', v_n_ref,
    'bloqueados',          v_bloqueados
  );
end;
$$;

-- ---------- 6. personas_con_problemas ----------
-- p_problema: sin_cedula | sin_puesto | sin_verificar | sin_lider | varios_lideres
-- Filtros opcionales: un referente o un barrio (sin importar tildes ni mayúsculas).
-- Máximo 50 filas; `total` trae cuántas cumplen en total.
-- No devuelve cédula, celular ni dirección.
create or replace function public.personas_con_problemas(
  p_problema  text,
  p_referente uuid default null,
  p_barrio    text default null
)
returns table (
  id                     uuid,
  nombre                 text,
  barrio                 text,
  puesto_votacion        text,
  municipio_verificacion public.verificacion_municipio,
  sin_cedula             boolean,
  lideres                bigint,
  referentes             text,
  total                  bigint
)
language sql stable security invoker
set search_path = ''
as $$
  with base as (
    select
      p.id, p.nombre, p.barrio, p.puesto_votacion, p.municipio_verificacion,
      p.cedula is null as sin_cedula,
      (select count(*) from public.vinculos v join public.referentes r on r.id = v.referente_id
        where v.persona_id = p.id and v.activo and r.tipo = 'lider') as lideres,
      (select string_agg(r.nombre, ', ' order by r.nombre) from public.vinculos v
        join public.referentes r on r.id = v.referente_id
        where v.persona_id = p.id and v.activo) as referentes
    from public.personas p
    where (p_referente is null or exists (
            select 1 from public.vinculos v
            where v.persona_id = p.id and v.referente_id = p_referente and v.activo))
      and (p_barrio is null or public.sin_tildes(p.barrio) = public.sin_tildes(trim(p_barrio)))
  )
  select b.*, count(*) over () as total
  from base b
  where case p_problema
    when 'sin_cedula'     then b.sin_cedula
    when 'sin_puesto'     then b.puesto_votacion is null
    when 'sin_verificar'  then b.municipio_verificacion is null
    when 'sin_lider'      then b.lideres = 0
    when 'varios_lideres' then b.lideres >= 2
    else false
  end
  order by b.nombre
  limit 50;
$$;

-- ---------- permisos ----------
revoke all on function public.soy_admin()                                 from public, anon;
revoke all on function public.importar_lote(text, text, text[], text[], text[], jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.deshacer_lote(uuid)                         from public, anon;
revoke all on function public.personas_con_problemas(text, uuid, text)   from public, anon;
grant execute on function public.soy_admin()                               to authenticated;
grant execute on function public.importar_lote(text, text, text[], text[], text[], jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.deshacer_lote(uuid)                       to authenticated;
grant execute on function public.personas_con_problemas(text, uuid, text) to authenticated;
