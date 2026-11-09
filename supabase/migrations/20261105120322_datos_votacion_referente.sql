-- Datos de votación y coordinador en el referente.
-- En el Excel hay líderes que aparecen en su propia lista (vinculados a sí
-- mismos). Se importan solo como líder, no como persona, así que su fila
-- trae datos que el referente no tenía dónde guardar: puesto de votación,
-- mesa, verificación del municipio y coordinador.
-- (Pedido del desarrollador el 2026-11-05.)

alter table public.referentes
  add column puesto_votacion        text references public.puestos_votacion (nombre) on update cascade,
  add column mesa                   integer check (mesa > 0),
  add column municipio_verificacion public.verificacion_municipio,  -- vacío = sin verificar
  add column coordinador            text;

create index referentes_puesto_idx on public.referentes (puesto_votacion);
