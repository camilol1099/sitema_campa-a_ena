-- =====================================================================
-- Sistema de campaña · esquema inicial
-- Tablas: admins, referentes (líder / empresario / aliado), personas,
--         vinculos (persona ↔ referente), historial
-- Seguridad: RLS en todas las tablas; solo administradores (privado.es_admin())
-- =====================================================================

create schema if not exists privado;

-- ---------- tipos ----------
create type public.tipo_referente as enum ('lider', 'empresario', 'aliado');
create type public.estado_referente as enum ('activo', 'inactivo');
create type public.verificacion_municipio as enum
  ('Valledupar', 'No vota en el municipio', 'No está en el censo', 'Errado', 'Cancelado');
create type public.origen_registro as enum ('excel_2025', 'manual');

-- ---------- administradores ----------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- referentes: líderes, empresarios y aliados ----------
create table public.referentes (
  id                 uuid primary key default gen_random_uuid(),
  tipo               public.tipo_referente not null,
  nombre             text not null check (length(trim(nombre)) > 0),
  cedula             text unique check (cedula ~ '^[0-9]+$'),
  celular            text,              -- se guarda, no se muestra en la ficha
  direccion          text,              -- se guarda, no se muestra en la ficha
  barrio             text,
  municipio          text,
  estado             public.estado_referente not null default 'activo',
  meta_personas      integer check (meta_personas >= 0),
  notas              text,
  -- solo empresarios
  empresa            text,
  sector             text,
  cargo              text,
  -- solo aliados
  partido_movimiento text,
  cargo_politico     text,
  zona_influencia    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by         uuid default auth.uid() references auth.users (id) on delete set null,
  constraint campos_empresario check (tipo = 'empresario' or (empresa is null and sector is null and cargo is null)),
  constraint campos_aliado check (tipo = 'aliado' or (partido_movimiento is null and cargo_politico is null and zona_influencia is null))
);
create index referentes_tipo_idx on public.referentes (tipo);
create index referentes_nombre_idx on public.referentes (lower(nombre));

-- ---------- personas ----------
create table public.personas (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null check (length(trim(nombre)) > 0),
  cedula                  text unique check (cedula ~ '^[0-9]+$'),   -- puede faltar; si existe, no se repite
  celular                 text,
  direccion               text,
  barrio                  text,
  municipio_verificacion  public.verificacion_municipio,             -- vacío = sin verificar
  puesto_votacion         text,
  mesa                    integer check (mesa > 0),
  observaciones           text,
  autorizacion_datos      boolean not null default false,            -- Ley 1581 de 2012
  fecha_autorizacion      timestamptz,
  origen                  public.origen_registro not null default 'manual',
  excel_numero            integer,                                   -- el # original del Excel
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by              uuid default auth.uid() references auth.users (id) on delete set null
);
create index personas_nombre_idx on public.personas (lower(nombre));
create index personas_barrio_idx on public.personas (barrio);

-- ---------- vínculos persona ↔ referente ----------
create table public.vinculos (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid not null references public.personas (id) on delete cascade,
  referente_id  uuid not null references public.referentes (id) on delete cascade,
  coordinador   text,
  fecha_vinculo date not null default current_date,
  activo        boolean not null default true,
  nota          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by    uuid default auth.uid() references auth.users (id) on delete set null,
  unique (persona_id, referente_id)
);
create index vinculos_referente_idx on public.vinculos (referente_id);
create index vinculos_persona_idx on public.vinculos (persona_id);

-- ---------- historial de cambios ----------
create table public.historial (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id uuid not null,
  accion      text not null check (accion in ('crear', 'editar', 'eliminar', 'vincular', 'desvincular')),
  cambios     jsonb,
  usuario     uuid,
  fecha       timestamptz not null default now()
);
create index historial_registro_idx on public.historial (tabla, registro_id, fecha desc);

-- ---------- funciones internas (esquema privado, no expuesto en la API) ----------
create function privado.es_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function privado.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create function privado.registrar_historial()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_accion text;
begin
  if tg_op = 'INSERT' then
    v_accion := case when tg_table_name = 'vinculos' then 'vincular' else 'crear' end;
    insert into public.historial (tabla, registro_id, accion, cambios, usuario)
    values (tg_table_name, new.id, v_accion, jsonb_build_object('despues', to_jsonb(new)), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at' - 'updated_by') is distinct from (to_jsonb(old) - 'updated_at' - 'updated_by') then
      v_accion := case when tg_table_name = 'vinculos' and old.activo and not new.activo then 'desvincular' else 'editar' end;
      insert into public.historial (tabla, registro_id, accion, cambios, usuario)
      values (tg_table_name, new.id, v_accion, jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new)), auth.uid());
    end if;
    return new;
  else
    v_accion := case when tg_table_name = 'vinculos' then 'desvincular' else 'eliminar' end;
    insert into public.historial (tabla, registro_id, accion, cambios, usuario)
    values (tg_table_name, old.id, v_accion, jsonb_build_object('antes', to_jsonb(old)), auth.uid());
    return old;
  end if;
end;
$$;

-- ---------- triggers ----------
create trigger referentes_actualizado before update on public.referentes for each row execute function privado.tocar_actualizado();
create trigger personas_actualizado   before update on public.personas   for each row execute function privado.tocar_actualizado();
create trigger vinculos_actualizado   before update on public.vinculos   for each row execute function privado.tocar_actualizado();

create trigger referentes_historial after insert or update or delete on public.referentes for each row execute function privado.registrar_historial();
create trigger personas_historial   after insert or update or delete on public.personas   for each row execute function privado.registrar_historial();
create trigger vinculos_historial   after insert or update or delete on public.vinculos   for each row execute function privado.registrar_historial();

-- ---------- permisos del esquema privado ----------
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
revoke all on all functions in schema privado from public, anon, authenticated;
grant execute on function privado.es_admin() to authenticated;

-- ---------- vista para listas (sin dirección ni teléfono) ----------
create view public.referentes_resumen
with (security_invoker = true) as
select
  r.id, r.tipo, r.nombre, r.barrio, r.estado, r.meta_personas,
  r.empresa, r.sector, r.partido_movimiento, r.cargo_politico,
  count(v.id) filter (where v.activo) as total_personas,
  r.updated_at
from public.referentes r
left join public.vinculos v on v.referente_id = r.id
group by r.id;

-- ---------- RLS: solo administradores ----------
alter table public.admins     enable row level security;
alter table public.referentes enable row level security;
alter table public.personas   enable row level security;
alter table public.vinculos   enable row level security;
alter table public.historial  enable row level security;

create policy "admins gestionan referentes" on public.referentes
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admins gestionan personas" on public.personas
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admins gestionan vinculos" on public.vinculos
  for all to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "admins leen el historial" on public.historial
  for select to authenticated using ((select privado.es_admin()));
-- admins: sin políticas → nadie la lee desde la API; solo es_admin() (security definer).

-- anon no tiene nada que hacer aquí
revoke all on all tables in schema public from anon;
revoke all on public.referentes_resumen from anon;
-- el historial solo se escribe por triggers
revoke insert, update, delete on public.historial from authenticated;
