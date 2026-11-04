-- =====================================================================
-- Datos de prueba FICTICIOS para desarrollo (no son datos reales).
-- 10 líderes, 4 empresarios, 4 aliados y 300 personas, con casos difíciles:
-- sin cédula, sin barrio, sin verificar, que no votan en Valledupar,
-- sin vínculo y con dos referentes a la vez.
-- =====================================================================
select setseed(0.42);

-- ---------- referentes ----------
insert into public.referentes (tipo, nombre, cedula, celular, direccion, barrio, municipio, estado, meta_personas, notas) values
  ('lider', 'Rosa Elena Daza Maestre',      '1065100001', '3000000101', 'Calle 16 # 10-20',   'Primero de Mayo', 'Valledupar', 'activo',   60, 'Líder fuerte en el sur'),
  ('lider', 'Jorge Luis Oñate Cuello',      '1065100002', '3000000102', 'Carrera 19 # 21-15', 'Fundadores',      'Valledupar', 'activo',   40, null),
  ('lider', 'Marelvis Pacheco Ariza',       '1065100003', '3000000103', 'Mz 12 Casa 4',       'Dangond',         'Valledupar', 'activo',   35, null),
  ('lider', 'Hernán Darío Mendoza Brito',   '1065100004', '3000000104', 'Calle 21 # 5-30',    'Panamá',          'Valledupar', 'activo',   30, null),
  ('lider', 'Yuleidis Castro Montero',      '1065100005', '3000000105', 'Diagonal 21 # 18-40','Villa Corelca',   'Valledupar', 'activo',   30, null),
  ('lider', 'Camilo Andrés Quintero Vega',  '1065100006', '3000000106', 'Carrera 9 # 14-02',  'Loperena',        'Valledupar', 'activo',   25, null),
  ('lider', 'Liliana Bolaño Orozco',        '1065100007', '3000000107', 'Mz 30 Casa 11',      'Camperucho',      'Valledupar', 'activo',   25, null),
  ('lider', 'Wilmer Fuentes Pumarejo',      '1065100008', '3000000108', 'Calle 44 # 23-10',   'San Martín',      'Valledupar', 'activo',   20, null),
  ('lider', 'Ingrid Paola Araújo Zuleta',   '1065100009', '3000000109', null,                 null,              'Valledupar', 'activo',   15, 'Falta su dirección'),
  ('lider', 'Óscar Iván Rodríguez Cotes',   null,         null,         null,                 'Los Mayales',     'Valledupar', 'inactivo', null, 'Se retiró en septiembre');

insert into public.referentes (tipo, nombre, cedula, celular, direccion, barrio, municipio, meta_personas, empresa, sector, cargo) values
  ('empresario', 'Ramiro Gutiérrez Molina',  '1065200001', '3000000201', 'Calle 15 # 7-80',  'Centro',      'Valledupar', 50, 'Distribuidora El Valle',   'Comercio',     'Gerente'),
  ('empresario', 'Claudia Hinojosa Barros',  '1065200002', '3000000202', 'Carrera 4 # 12-30','Novalito',    'Valledupar', 30, 'Clínica Dental Sonrisa',   'Salud',        'Propietaria'),
  ('empresario', 'Eduardo Carrillo Mejía',   '1065200003', '3000000203', null,               'San Joaquín', 'Valledupar', 25, 'Transportes Guatapurí',    'Transporte',   'Socio'),
  ('empresario', 'Diana Patricia Ospino',    '1065200004', '3000000204', null,               null,          'Valledupar', null, 'Restaurante La Casona',  'Gastronomía',  'Administradora');

insert into public.referentes (tipo, nombre, cedula, celular, direccion, barrio, municipio, meta_personas, partido_movimiento, cargo_politico, zona_influencia) values
  ('aliado', 'Juan Pedro Maestre Arias',   '1065300001', '3000000301', null, 'Simón Bolívar', 'Valledupar', 80, 'Movimiento Ciudadano', 'Edil Comuna 2',                 'Comuna 2'),
  ('aliado', 'Sandra Milena Cuello Daza',  '1065300002', '3000000302', null, 'La Esperanza',  'Valledupar', 60, 'Partido Verde',        'Presidenta JAC La Esperanza',   'Comuna 5'),
  ('aliado', 'Fabián Romero Pérez',        '1065300003', '3000000303', null, 'Don Carmelo',   'Valledupar', 45, 'Partido Liberal',      'Exconcejal',                    'Comuna 3'),
  ('aliado', 'Yesenia Molina Ospino',      '1065300004', '3000000304', null, null,            'Valledupar', null, 'Independiente',      'Lideresa comunal',              'Corregimientos');

-- ---------- 300 personas ----------
with d as (
  select
    array['María','José','Luis','Ana','Carlos','Yuleidis','Jesús','Rosa','Andrés','Diana','Jorge','Leidy','Elkin','Daniela','Javier',
          'Katherine','Óscar','Yesenia','Alberto','Paola','Rafael','Marelvis','Hernán','Luz','Camilo','Ingrid','Wilmer','Sandra','Fabián',
          'Yarledis','Eduardo','Claudia','Ramiro','Liliana','Iván','Mileidys'] as n,
    array['Pérez','Gutiérrez','Mendoza','Arias','Castro','Oñate','Daza','Maestre','Fuentes','Romero','Quintero','Montero','Bolaño',
          'Ospino','Mejía','Rodríguez','Pacheco','Zuleta','Vega','Cuello','Molina','Araújo','Ariza','Carrillo','Barros','Orozco',
          'Pumarejo','Cotes','Hinojosa','Brito'] as a,
    array['Fundadores','Primero de Mayo','Camperucho','Dangond','Los Mayales','Simón Bolívar','Villa Corelca','Panamá','450 Años',
          'Don Carmelo','San Martín','Nueva Esperanza','La Esperanza','Don Alberto','San Fernando','Loperena','San Joaquín','Garupal',
          'Populandia','Villa Miriam','Novalito','Centro','Los Cortijos','Villa Castro'] as b,
    array['IE Leonidas Acuña','IE Rafael Valle Meza','Col. Nacional Loperena','Col. Francisco Molina Sánchez','Escuela Mixta No 4',
          'Conc. San Joaquín','Col. Nacionalizado Upar','Col. Comfacesar','Coliseo Julio Monsalvo','Col. José Eugenio Martínez',
          'IE Loperena Garupal','Col. Milciades Cantillo'] as p
)
insert into public.personas
  (nombre, cedula, celular, direccion, barrio, municipio_verificacion, puesto_votacion, mesa,
   observaciones, autorizacion_datos, fecha_autorizacion, origen)
select
  d.n[1 + floor(x.r1 * cardinality(d.n))::int] || ' ' || d.a[1 + floor(x.r2 * cardinality(d.a))::int] || ' ' || d.a[1 + floor(x.r3 * cardinality(d.a))::int],
  case when g.i % 7 = 0 then null else (1003000000 + g.i * 3517)::text end,                         -- ~1 de cada 7 sin cédula
  case when g.i % 11 = 0 then null else '3000' || lpad(g.i::text, 6, '0') end,                       -- números claramente ficticios
  case when x.r4 < 0.30 then null
       when x.r4 < 0.60 then 'Mz ' || (1 + floor(x.r5 * 90))::int || ' Casa ' || (1 + floor(x.r1 * 30))::int
       else (case when x.r5 < 0.5 then 'Calle ' else 'Carrera ' end) || (1 + floor(x.r2 * 45))::int || ' # ' || (1 + floor(x.r3 * 40))::int || '-' || (10 + floor(x.r4 * 80))::int end,
  case when x.r5 < 0.35 then null else d.b[1 + floor(x.r3 * cardinality(d.b))::int] end,          -- ~35 % sin barrio
  (case when x.r6 < 0.55 then 'Valledupar'
        when x.r6 < 0.60 then 'No vota en el municipio'
        when x.r6 < 0.64 then 'No está en el censo'
        when x.r6 < 0.65 then 'Errado'
        else null end)::public.verificacion_municipio,                                             -- ~35 % sin verificar
  case when x.r7 < 0.12 then null else d.p[1 + floor(x.r1 * cardinality(d.p))::int] end,
  case when x.r7 < 0.12 then null else (1 + floor(x.r2 * 40))::int end,
  case when g.i % 37 = 0 then 'Pidió que la llamen en la tarde' end,
  x.r8 < 0.40,
  case when x.r8 < 0.40 then now() - (floor(x.r1 * 60) || ' days')::interval end,
  'manual'
from generate_series(1, 300) as g(i)
cross join d
cross join lateral (
  select g.i as k, random() as r1, random() as r2, random() as r3, random() as r4,
         random() as r5, random() as r6, random() as r7, random() as r8
) as x;

-- ---------- vínculos ----------
with p as (select id, row_number() over (order by cedula nulls last, id) as rn from public.personas),
     lid as (select array_agg(id order by nombre) as a from public.referentes where tipo = 'lider'),
     emp as (select array_agg(id order by nombre) as a from public.referentes where tipo = 'empresario'),
     ali as (select array_agg(id order by nombre) as a from public.referentes where tipo = 'aliado'),
     co  as (select array['Daniela Solano Ríos','Francisco Ustáriz Peña','Paola Páramo Díaz','Elvis Díaz Lobo'] as c)
insert into public.vinculos (persona_id, referente_id, coordinador)
select
  p.id,
  case when p.rn % 10 = 0 then emp.a[1 + (p.rn / 10) % cardinality(emp.a)]
       when p.rn % 10 = 1 then ali.a[1 + (p.rn / 10) % cardinality(ali.a)]
       else lid.a[1 + floor(power(random(), 1.6) * cardinality(lid.a))::int] end,                  -- líderes con tamaños desiguales
  case when random() < 0.5 then co.c[1 + floor(random() * cardinality(co.c))::int] end
from p, lid, emp, ali, co
where p.rn > 5;                                                                                    -- 5 personas sin vínculo

-- 15 personas con un segundo referente (empresario o aliado)
with p as (select id, row_number() over (order by cedula nulls last, id) as rn from public.personas),
     emp as (select array_agg(id order by nombre) as a from public.referentes where tipo = 'empresario'),
     ali as (select array_agg(id order by nombre) as a from public.referentes where tipo = 'aliado')
insert into public.vinculos (persona_id, referente_id, nota)
select p.id,
       case when p.rn % 2 = 0 then emp.a[1 + p.rn % cardinality(emp.a)] else ali.a[1 + p.rn % cardinality(ali.a)] end,
       'También apoya por este referente'
from p, emp, ali
where p.rn between 22 and 60 and p.rn % 10 between 2 and 9
order by p.rn
limit 15;

-- el historial empieza limpio: la carga de prueba no cuenta como cambios
truncate public.historial restart identity;
