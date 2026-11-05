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

## Datos de prueba (mientras llega el Excel nuevo)

Todavía **no hay información real**: la clienta enviará un Excel nuevo. Mientras tanto:
- Desarrolla con **datos ficticios** generados por `supabase/seed.sql` (o un script en `scripts/seed`):
  unos 10 líderes, 4 empresarios, 4 aliados y ~300 personas con nombres inventados, algunas sin cédula,
  sin barrio o vinculadas a dos referentes, para probar todos los casos.
- No inventes columnas nuevas pensando en el Excel futuro: cuando llegue, se revisan sus columnas
  y se ajusta el script de importación.
- El script de importación debe aceptar un **mapeo de columnas configurable** (nombre de columna del Excel → campo).

## Datos de origen (Excel del año pasado, referencia)

`data/BD_Jesús_Perpiñán.xlsx`, hoja **Hoja1**: 1.981 filas. Columnas:
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
