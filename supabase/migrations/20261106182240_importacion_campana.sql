-- Importación del formato de Excel de la campaña (docs/FORMATO_EXCEL.md).
--
-- 1) Cédula de 6 a 10 dígitos en personas y referentes (NOT VALID: no revisa
--    los datos que ya existen; sí las filas nuevas y las que se editen).
-- 2) Una cédula no puede estar a la vez en personas y en referentes.
-- 3) importaciones.cambios: valores que el lote llenó en líderes existentes,
--    y el tipo "campana" (lote con líderes, personas y vínculos).
-- 4) importar_lote: además de crear, completa líderes existentes (solo campos
--    vacíos; nunca sobrescribe) y guarda lo que llenó.
-- 5) deshacer_lote: además de borrar lo creado, vuelve a dejar vacíos los datos
--    que llenó, si nadie editó ese líder después.

-- ---------- 1. formato de cédula ----------
alter table public.personas
  add constraint personas_cedula_formato check (cedula ~ '^[0-9]{6,10}$') not valid;
alter table public.referentes
  add constraint referentes_cedula_formato check (cedula ~ '^[0-9]{6,10}$') not valid;

-- ---------- 2. nadie es persona y referente a la vez ----------
-- security definer: debe ver la otra tabla completa aunque RLS cambie.
create or replace function privado.cedula_en_una_sola_tabla()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.cedula is null then
    return new;
  end if;
  if tg_table_name = 'personas' then
    if exists (select 1 from public.referentes r where r.cedula = new.cedula) then
      raise exception 'La cédula % ya es de un referente; una persona no puede ser también referente', new.cedula
        using errcode = '23505';
    end if;
  elsif exists (select 1 from public.personas p where p.cedula = new.cedula) then
    raise exception 'La cédula % ya es de una persona; no puede ser también referente', new.cedula
      using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function privado.cedula_en_una_sola_tabla() from public, anon, authenticated;

create trigger personas_cedula_una_tabla
  before insert or update of cedula on public.personas
  for each row execute function privado.cedula_en_una_sola_tabla();
create trigger referentes_cedula_una_tabla
  before insert or update of cedula on public.referentes
  for each row execute function privado.cedula_en_una_sola_tabla();

-- ---------- 3. importaciones ----------
alter table public.importaciones
  add column cambios jsonb not null default '{}'::jsonb;
alter table public.importaciones
  drop constraint importaciones_tipo_check,
  add constraint importaciones_tipo_check check (tipo in ('persona', 'lider', 'empresario', 'aliado', 'campana'));

-- ---------- 4. importar_lote (con líderes a completar) ----------
drop function public.importar_lote(text, text, text[], text[], text[], jsonb, jsonb, jsonb);

create or replace function public.importar_lote(
  p_archivo    text,
  p_tipo       text,
  p_barrios    text[],
  p_puestos    text[],
  p_municipios text[],
  p_referentes jsonb,
  p_personas   jsonb,
  p_vinculos   jsonb,
  -- [{ "id": <referente existente>, "campos": { "cedula": "...", "barrio": "...", ... } }]
  p_completar  jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_lote    uuid;
  v_ref     integer;
  v_per     integer;
  v_c       record;
  v_actual  public.referentes;
  v_llenos  jsonb;
  v_cambios jsonb := '[]'::jsonb;
begin
  if not privado.es_admin() then
    raise exception 'Solo la administradora puede importar' using errcode = '42501';
  end if;

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

  -- Líderes existentes: solo se llenan los campos que hoy están vacíos.
  for v_c in
    select x.id, x.campos from jsonb_to_recordset(coalesce(p_completar, '[]')) as x(id uuid, campos jsonb)
  loop
    select * into v_actual from public.referentes where id = v_c.id for update;
    if not found then
      raise exception 'No existe el líder a completar' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_llenos
    from jsonb_each(v_c.campos) e
    where e.key in ('cedula', 'celular', 'direccion', 'barrio', 'puesto_votacion', 'mesa', 'municipio_verificacion', 'coordinador')
      and e.value <> 'null'::jsonb
      and (to_jsonb(v_actual) ->> e.key) is null;
    if v_llenos <> '{}'::jsonb then
      update public.referentes r set
        cedula                 = coalesce(r.cedula, v_llenos ->> 'cedula'),
        celular                = coalesce(r.celular, v_llenos ->> 'celular'),
        direccion              = coalesce(r.direccion, v_llenos ->> 'direccion'),
        barrio                 = coalesce(r.barrio, v_llenos ->> 'barrio'),
        puesto_votacion        = coalesce(r.puesto_votacion, v_llenos ->> 'puesto_votacion'),
        mesa                   = coalesce(r.mesa, (v_llenos ->> 'mesa')::integer),
        municipio_verificacion = coalesce(r.municipio_verificacion, (v_llenos ->> 'municipio_verificacion')::public.verificacion_municipio),
        coordinador            = coalesce(r.coordinador, v_llenos ->> 'coordinador')
      where r.id = v_c.id;
      v_cambios := v_cambios || jsonb_build_array(
        jsonb_build_object('id', v_c.id, 'nombre', v_actual.nombre, 'campos', v_llenos, 'restaurado', false));
    end if;
  end loop;

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

  update public.importaciones
  set filas_creadas = v_ref + v_per,
      cambios = jsonb_build_object('referentes', v_cambios)
  where id = v_lote;

  return v_lote;
end;
$$;

-- ---------- 5. deshacer_lote (restaura líderes completados) ----------
create or replace function public.deshacer_lote(p_lote uuid)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_imp        public.importaciones;
  v_per_bloq   uuid[];
  v_ref_bloq   uuid[];
  v_vin_bloq   uuid[];
  v_cambio     boolean := true;
  v_n_vin      integer;
  v_n_per      integer;
  v_n_ref      integer;
  v_n_rest     integer := 0;
  v_bloqueados jsonb;
  v_c          record;
  v_cambios    jsonb := '[]'::jsonb;
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

  -- Propaga el bloqueo por los vínculos del lote hasta que no cambie nada.
  while v_cambio loop
    v_cambio := false;

    with nuevos as (
      select v.id from public.vinculos v
      where v.lote_id = p_lote
        and not (v.id = any (v_vin_bloq))
        and (v.persona_id = any (v_per_bloq) or v.referente_id = any (v_ref_bloq))
    )
    select v_vin_bloq || coalesce(array_agg(id), '{}'), count(*) > 0 or v_cambio
      into v_vin_bloq, v_cambio from nuevos;

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

  -- Líderes existentes que el lote completó: se vuelven a dejar vacíos los campos
  -- que llenó, si nadie los editó después (historial posterior al lote).
  for v_c in
    select x.id, x.nombre, x.campos, coalesce(x.restaurado, false) as restaurado
    from jsonb_to_recordset(coalesce(v_imp.cambios -> 'referentes', '[]'::jsonb))
      as x(id uuid, nombre text, campos jsonb, restaurado boolean)
  loop
    if v_c.restaurado then
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object('id', v_c.id, 'nombre', v_c.nombre, 'campos', v_c.campos, 'restaurado', true));
    elsif exists (select 1 from public.historial h
                  where h.tabla = 'referentes' and h.registro_id = v_c.id
                    and h.accion <> 'crear' and h.fecha > v_imp.created_at) then
      v_bloqueados := v_bloqueados || jsonb_build_array(jsonb_build_object(
        'tipo', 'lider', 'id', v_c.id, 'nombre', v_c.nombre,
        'motivo', 'se editó después de completarlo; los datos que llenó el lote se dejaron'));
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object('id', v_c.id, 'nombre', v_c.nombre, 'campos', v_c.campos, 'restaurado', false));
    else
      update public.referentes r set
        cedula                 = case when v_c.campos ? 'cedula' then null else r.cedula end,
        celular                = case when v_c.campos ? 'celular' then null else r.celular end,
        direccion              = case when v_c.campos ? 'direccion' then null else r.direccion end,
        barrio                 = case when v_c.campos ? 'barrio' then null else r.barrio end,
        puesto_votacion        = case when v_c.campos ? 'puesto_votacion' then null else r.puesto_votacion end,
        mesa                   = case when v_c.campos ? 'mesa' then null else r.mesa end,
        municipio_verificacion = case when v_c.campos ? 'municipio_verificacion' then null else r.municipio_verificacion end,
        coordinador            = case when v_c.campos ? 'coordinador' then null else r.coordinador end
      where r.id = v_c.id;
      if found then
        v_n_rest := v_n_rest + 1;
      end if;
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object('id', v_c.id, 'nombre', v_c.nombre, 'campos', v_c.campos, 'restaurado', true));
    end if;
  end loop;

  update public.importaciones
  set cambios = coalesce(cambios, '{}'::jsonb) || jsonb_build_object('referentes', v_cambios),
      deshecha_at = case when jsonb_array_length(v_bloqueados) = 0 then now() else null end
  where id = p_lote;

  return jsonb_build_object(
    'vinculos_borrados',      v_n_vin,
    'personas_borradas',      v_n_per,
    'referentes_borrados',    v_n_ref,
    'referentes_restaurados', v_n_rest,
    'bloqueados',             v_bloqueados
  );
end;
$$;

-- ---------- permisos ----------
revoke all on function public.importar_lote(text, text, text[], text[], text[], jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.importar_lote(text, text, text[], text[], text[], jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.deshacer_lote(uuid) from public, anon;
grant execute on function public.deshacer_lote(uuid) to authenticated;
