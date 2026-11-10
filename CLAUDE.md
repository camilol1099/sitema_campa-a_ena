# Sistema de campaña – Jesús Perpiñán (Concejo de Valledupar)

Sistema web privado para que la administradora de la campaña (Ena Arredondo) organice a las personas
que apoyan la campaña según quién las trae. El mapa ya NO es el centro del sistema; queda para después.

## Cómo trabajar en este repo (reglas)

- **Antes de implementar algo que no esté en este archivo, pregúntale al desarrollador.** Nada de funciones extra.
- Primero que funcione; después se mejora. Cambios pequeños y revisables.
- Responde y escribe la interfaz en español (Colombia), en lenguaje sencillo para la clienta.
- **Datos personales sensibles (Ley 1581 de 2012):** nunca subas a git el Excel ni datos reales.
  `data/` y `.env*` están en `.gitignore`. Nunca pongas la `service_role key` en código del navegador.
- **No modificar los datos del Excel al importarlos.** Se importan tal cual; las inconsistencias se marcan, no se corrigen.
- Si hay duda sobre cómo unificar un barrio o un dato ambiguo, **pregúntale al desarrollador**; mientras tanto queda "sin asignar".

## Alcance por fases

La estructura es la misma en las tres fases: un **referente** (quien trae gente) y sus **personas**.

| Fase | Eje | Referente | Qué se ve |
|---|---|---|---|
| 1 | Líderes | Líder | Lista de líderes → al tocar uno, sus personas → al tocar una persona, toda su información |
| 2 | Empresarios | Empresario | Igual que fase 1 |
| 3 | Aliados políticos | Aliado | Igual que fase 1 |

Construye las pantallas **una sola vez, parametrizadas por tipo de referente**, para que las fases 2 y 3 sean
casi solo configuración.

### Reglas de visualización
- **Ficha del referente (líder, empresario, aliado):** NO mostrar dirección ni teléfono (se guardan, pero no se muestran).
  Mostrar: nombre, tipo, barrio, datos propios del tipo, cuántas personas tiene y su lista.
- **Ficha de la persona:** mostrar toda su información.
- La información se actualiza constantemente: crear, editar y vincular desde la web; cada cambio queda registrado.

### Fase 1 (MVP), en este orden
1. Login (un solo usuario administrador).
2. Lista de líderes con búsqueda y número de personas de cada uno.
3. Ficha del líder (sin dirección ni teléfono) con la lista de sus personas.
4. Ficha completa de la persona.
5. Crear y editar líderes y personas; vincular una persona a un líder.
6. Importar el Excel (cuando llegue el nuevo), sin modificar sus valores.

## Stack

- **Next.js** (App Router, TypeScript) + **Tailwind**. Marca: verde `#214820`, verde hoja `#48a733`,
  acento `#e8431e` (solo alertas), tipografía **Poppins**.
- **Supabase**: Postgres + Auth + API automática (`supabase-js`) + RLS. Sin servidor aparte.
- Migraciones versionadas en `supabase/migrations/` (Supabase CLI).
- Despliegue: Vercel.

## Modelo de datos

Todas las tablas con `id uuid`, `created_at`, `updated_at` (trigger), `created_by`, `updated_by`.

### `referentes` (líderes, empresarios y aliados en una sola tabla)
| Campo | Notas |
|---|---|
| `tipo` | `lider` \| `empresario` \| `aliado` |
| `nombre` | obligatorio |
| `cedula` | única si existe |
| `celular`, `direccion` | se guardan, **no se muestran** en la ficha |
| `barrio`, `municipio` | de las listas `barrios` y `municipios` |
| `puesto_votacion`, `mesa`, `municipio_verificacion`, `coordinador` | del propio referente (líderes que en el Excel estaban vinculados a sí mismos); sí se muestran |
| Solo empresario: `empresa` | |
| Solo aliado: `zona_influencia` | |

(Sin meta de personas, notas, sector ni partido/movimiento: se quitaron a pedido del desarrollador.)

### `personas`
| Campo | Notas |
|---|---|
| `nombre` | obligatorio |
| `cedula` | **única si existe** (puede faltar) |
| `celular`, `direccion` | |
| `barrio` | de la lista `barrios` |
| `municipio_verificacion` | `Valledupar`, `No vota en el municipio`, `No está en el censo`, `Errado`, `Cancelado` o vacío (sin verificar) |
| `puesto_votacion` | de la lista `puestos_votacion` |
| `mesa` | |
| `observaciones` | |

### Listas: `barrios`, `municipios`, `puestos_votacion`
Una columna `nombre` (llave primaria, sin espacios sobrantes). `referentes.barrio`, `referentes.municipio`,
`personas.barrio` y `personas.puesto_votacion` guardan el nombre con llave foránea `on update cascade`.
En los formularios se elige de una lista con búsqueda; si no aparece, se agrega como nuevo
(se compara sin tildes ni mayúsculas para no duplicar). Al importar el Excel, los nombres que falten
se agregan a la lista tal como vienen; unificar variantes se consulta con el desarrollador.
| `autorizacion_datos`, `fecha_autorizacion` | Ley 1581 |
| `origen` | `excel_2025` \| `manual` |
| `excel_numero` | el `#` original del Excel, si viene de ahí |

### `vinculos` (persona ↔ referente)
| Campo | Notas |
|---|---|
| `persona_id`, `referente_id` | único por par |
| `coordinador` | texto; en el Excel el coordinador va por persona |
| `fecha_vinculo`, `activo`, `nota` | |

Una persona **puede** tener vínculos con varios referentes (por ejemplo, un líder y un empresario).
La interfaz debe avisar cuando una persona ya está con otro referente.

### `historial`
`tabla`, `registro_id`, `accion` (`crear`/`editar`/`vincular`/`desvincular`), `cambios` (jsonb: antes y después), `usuario`, `fecha`. Se llena con triggers.

### `admins`
`user_id` de quien puede entrar.

## Seguridad

- RLS activo en **todas** las tablas. Política `to authenticated using (privado.es_admin()) with check (privado.es_admin())`.
- `privado.es_admin()`: `security definer`, `set search_path = ''`, en el esquema `privado` (no expuesto);
  quitar `execute` a `public` y `anon`.
- Vistas con `security_invoker = true`. Funciones de consulta como `security invoker`.
- Registro de usuarios desactivado en Supabase Auth; MFA para la administradora.
- Búsquedas sin armar filtros `.or()` con texto crudo del usuario.
- Probar con la `anon key` sin sesión: toda consulta debe devolver vacío.

## Datos reales (desde el 2026-11-05)

Ya no hay datos ficticios (se quitó `supabase/seed.sql`). Se usan los datos reales del Excel; todas las personas
autorizaron el tratamiento de datos. Por ahora solo líderes y sus personas (sin empresarios ni aliados).

- Importación: `python scripts/importar_excel.py "data/BD Jesús Perpiñán.xlsx"` revisa y escribe
  `data/informe_importacion.md`; con `--subir` sube los datos (solo si la base está vacía).
  `scripts/vaciar_datos_prueba.sql` vacía la base antes de importar.
- El mapeo de columnas del Excel está en `COLUMNAS` dentro del script.
- Líder vinculado a sí mismo (o un par de `MISMO_LIDER`): solo líder, con los datos de su fila; no es persona.
- Cédula repetida: la primera fila conserva la cédula; las demás quedan sin cédula y con observación.
- Líderes escritos distinto solo por mayúsculas/tildes se unen en uno.
- Nadie puede ser persona y líder a la vez: la fila con la misma cédula o el mismo nombre de un líder no se crea
  como persona; sus datos completan los que le falten al líder.
- Barrios que Excel convirtió en fecha o número se corrigen con `BARRIO_CORREGIDO` (aprobado por el desarrollador).
- "No se encuentra en el censo" del Excel se guarda como `No está en el censo`.

## Sin líder y panel de Revisión (desde el 2026-11-06)

- Nadie queda sin líder: quien no tiene uno queda con el líder especial **"Sin líder asignado"** (`lib/sin-lider.ts`),
  con toda su información. Pasa al crear sin referente, al importar y con los que ya existían. Al vincularla a un
  líder real, el vínculo con "Sin líder asignado" se desactiva solo.
- **Revisión** (`/revision`, pestaña con contador): personas que el sistema no sabe resolver: sin líder, cédula fuera
  de 6–10 dígitos y cédula repetida en el Excel. Se corrigen ahí mismo (`arreglarPersona`); un repetido que es la
  misma persona se puede borrar (`eliminarPersona`, queda en el historial).

## Despliegue, latido y pruebas de aceptación (desde el 2026-11-09)

- **Vercel** (`vercel.json`): región `gru1` (São Paulo, junto a la base de Supabase en `sa-east-1`).
  Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.
- **Latido** (`/api/latido`, tarea diaria en `vercel.json` → `crons`): llama a `public.latido()` (solo devuelve la
  hora) para que Supabase no pause el proyecto por 7 días sin uso. Es la única ruta sin sesión; si existe
  `CRON_SECRET`, exige `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía solo).
- Sin sesión, las rutas `/api/*` responden 401 con un mensaje (no redirigen al login).
- **Pruebas de aceptación** (`scripts/aceptacion.mjs`, `npm run test:aceptacion`): 42 pruebas en un navegador real
  contra la app en `localhost:3107` (o la URL que se le pase). Crean y borran registros "Prueba Aceptacion …"
  (cédulas 91003…) en la base real y dejan rastro en el historial. Correrlas antes de cada despliegue.

## Copia de seguridad en CSV (desde el 2026-11-09)

- Menú de la cuenta → "Copia de seguridad": descarga `personas`, `referentes` y `vinculos` (o las 3) desde
  `app/api/exportar/route.ts` (`?tabla=`). Sesión + `soy_admin()`, RLS; todas las filas de a 1000.
- `lib/csv.ts`: separador `;`, BOM UTF-8 (abre bien en Excel en español), y apóstrofo delante de textos que
  empiezan por `=`, `@` o `+`/`-` sin ser número (contra fórmulas). Columnas extra para leerlo sin cruzar tablas:
  personas → `referentes_activos`, `coordinadores`; vínculos → nombres y cédula.
- Los archivos tienen datos personales (Ley 1581): guardarlos en un lugar seguro, nunca en git.

## Asistente de IA (desde el 2026-11-06)

- Botón "Asistente" en la barra superior → panel de vidrio (`components/asistente.tsx`). La conversación no se guarda.
- Servidor: `app/api/asistente/route.ts` (sesión + `soy_admin()`, RLS; nunca service_role). Modelo en
  `lib/asistente/config.ts` (`MODELO`). Clave `ANTHROPIC_API_KEY` solo en el servidor.
- Herramientas en `lib/asistente/herramientas.ts`: solo supabase-js parametrizado, máximo 50 resultados.
  Las `proponer_*` no guardan: muestran una tarjeta y al confirmar se usan las acciones de los formularios.
- El asistente sí muestra cédula completa, celular y dirección de las **personas** (`buscar_personas`, `ver_persona`,
  y `con_contacto` en `ver_referente` / `personas_con_problemas`): la administradora está autorizada (pedido del
  2026-11-06). De los referentes no los muestra (regla de la ficha del referente).
- Archivos .xlsx/.csv: se leen en el navegador (SheetJS desde cdn.sheetjs.com, nunca `xlsx` 0.18.5 de npm).
  Al modelo solo van hojas, encabezados, 5 filas de ejemplo y el número de filas.
- Importación (`lib/importacion.ts`, `lib/campana.ts` + `app/(privado)/importacion.ts`): el formato de Excel de la
  campaña lo entiende el código (reglas en `docs/FORMATO_EXCEL.md`); el modelo solo da el filtro
  (`filtrar_importacion`) o, si el formato no se reconoce, el mapeo (`proponer_mapeo`). Una vista previa por
  secciones y un solo lote (`importar_lote`): crea líderes y personas y completa líderes existentes (solo campos
  vacíos). "Deshacer lote" (`deshacer_lote`) borra lo creado y restaura lo completado si nadie lo editó después.
- Cédula: una sola regla (`limpiarCedula` en `lib/validacion.ts`): sin puntos/espacios/comas, 6 a 10 dígitos;
  una cédula no puede estar en personas y referentes a la vez (también lo impide un trigger en la base).

## Datos de origen (Excel del año pasado, referencia)

`data/BD Jesús Perpiñán.xlsx`, hoja **BD** (encabezados en la fila 8): 1.980 filas. Columnas:
`#, NOMBRE, CÉDULA, CELULAR, DIRECCIÓN, BARRIO, Puesto de Votación, Mesa, Municipio, Lider, Coordinador`.

- 129 líderes (columna `Lider`) → se importan como `referentes` tipo `lider`; cada fila crea su `vinculo`.
- 13 coordinadores (columna `Coordinador`) → texto en `vinculos.coordinador`.
- Inconsistencias conocidas (marcar, no corregir): 157 sin cédula, 125 sin celular, 678 sin dirección,
  772 sin barrio, 5 sin líder, 29 cédulas repetidas (15 con líderes distintos),
  `Puesto de Votación` con `-` = vacío, `Mesa` con valores mixtos, `Municipio` vacío = sin verificar.
- Algunas cédulas vienen con formato (`77'023.344`): guardar solo dígitos.

## Estructura sugerida

```
app/            pantallas (login, referentes/[tipo], referentes/[tipo]/[id], personas/[id])
components/     componentes compartidos (listas, fichas, formularios)
lib/supabase/   clientes (navegador y servidor)
supabase/migrations/
scripts/        importación del Excel
data/           Excel y archivos sensibles (fuera de git)
```

## Pendiente de confirmar con la clienta
- Qué significa "200 casas" en el eje 1 (¿meta de casas por visitar? ¿meta de personas?).
- Qué campos extra quiere para empresarios y aliados.
- Si la cédula del referente se muestra en su ficha.
