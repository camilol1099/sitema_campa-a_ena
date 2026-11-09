-- Vacía la base antes de importar el Excel real (borra los datos ficticios
-- del seed y su historial). No toca administradores ni el esquema.
-- Correr en Supabase → SQL Editor, o con: supabase db execute -f scripts/vaciar_datos_prueba.sql
begin;
delete from public.vinculos;
delete from public.personas;
delete from public.referentes;
delete from public.barrios;
delete from public.puestos_votacion;
delete from public.municipios;
delete from public.historial;
commit;
