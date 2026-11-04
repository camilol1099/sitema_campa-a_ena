-- Corrige el trigger de historial (leía old.activo en tablas que no lo tienen)
-- y agrega índices a las llaves foráneas created_by / updated_by.

create or replace function privado.registrar_historial()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_accion text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_accion := case when tg_table_name = 'vinculos' then 'vincular' else 'crear' end;
    insert into public.historial (tabla, registro_id, accion, cambios, usuario)
    values (tg_table_name, new.id, v_accion, jsonb_build_object('despues', to_jsonb(new)), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if (v_new - 'updated_at' - 'updated_by') is distinct from (v_old - 'updated_at' - 'updated_by') then
      v_accion := case
        when tg_table_name = 'vinculos' and (v_old->>'activo') = 'true' and (v_new->>'activo') = 'false' then 'desvincular'
        else 'editar' end;
      insert into public.historial (tabla, registro_id, accion, cambios, usuario)
      values (tg_table_name, new.id, v_accion, jsonb_build_object('antes', v_old, 'despues', v_new), auth.uid());
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
revoke all on function privado.registrar_historial() from public, anon, authenticated;

create index referentes_created_by_idx on public.referentes (created_by);
create index referentes_updated_by_idx on public.referentes (updated_by);
create index personas_created_by_idx   on public.personas (created_by);
create index personas_updated_by_idx   on public.personas (updated_by);
create index vinculos_created_by_idx   on public.vinculos (created_by);
create index vinculos_updated_by_idx   on public.vinculos (updated_by);
