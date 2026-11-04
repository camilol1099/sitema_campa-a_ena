# Diseño de la interfaz

Referencia visual: `docs/diseno-referencia.html` (ábrelo en el navegador). **Implementa ese diseño**, no uno propio.
Si algo no está aquí ni en la referencia, pregunta antes de inventarlo.

## Idea central
La información es un árbol: **eje → referente → personas → ficha de la persona** (así lo dibujó la clienta).
La pantalla lo muestra de izquierda a derecha en **tres paneles**, sin menú lateral.

## Estructura de la pantalla
```
┌ Barra superior (60px, blanca, línea inferior) ─────────────────────────────────────────┐
│ [marca] Jesús Perpiñán   Líderes 10 | Empresarios 4 | Aliados políticos 4   [Buscar /] [AS] │
└───────────────────────────────────────────────────────────────────────────────────────┘
  Título del eje (24px) + frase con el hallazgo                [Nueva persona] [Nuevo líder]
  ┌ Cifras: 4 celdas divididas por líneas (un solo contenedor) ─────────────────────────┐
  └─────────────────────────────────────────────────────────────────────────────────────┘
  ┌ Referentes 344px ┐ ┌ Referente + sus personas (1fr) ┐ ┌ Ficha de la persona 392px ┐
  │ filtro, chips    │ │ ficha corta del referente      │ │ datos completos           │
  │ filas con meta   │ │ barra de avance a la meta      │ │ votación, referentes,     │
  │                  │ │ árbol de personas (ramas)      │ │ autorización, historial   │
  └──────────────────┘ └───────────────────────────────┘ └──────────────────────────┘
```
- Los tres ejes son **pestañas en la barra superior** con su número de referentes. La activa: texto en tinta + línea inferior de 2px en tinta.
- Rutas sugeridas: `/[eje]` (`/lideres`, `/empresarios`, `/aliados`), con `?referente=<id>&persona=<id>` para que el estado se pueda compartir y volver atrás.
- Búsqueda global (atajo `/`): por nombre o últimos dígitos de cédula; abre directamente la persona en su eje y referente.

## Estilo (achromatic ledger con la marca)
- La interfaz va en **tinta y neutros**. El verde solo en: el **dato principal** (barra de avance hacia la meta) y el **botón principal**.
- Menos del 1 % de la pantalla en color. Nada de fondos de color en tarjetas, degradados, sombras en elementos en reposo, íconos dentro de cuadros de color ni emojis.

### Tokens
```css
--ground:#f2f5f2;   /* fondo salvia */
--surface:#ffffff;  --raised:#f7f8f6;  --active:#eceee9;
--border:#e4e7e2;   --rule:#eff1ed;    --control:#cfd4cc;
--ink:#141a12;      --muted:#5d655a;   --faint:#646c61;
--hue:#2f8a24;      /* solo barras de meta */
--primary:#214820;  /* botón principal (uno por pantalla) */
--warn-bg:#fdf0e9;  --warn-ink:#9a3412;  /* sin cédula, no vota aquí, sin autorización */
--note-bg:#fff8e1;  --note-ink:#7a5200;  /* 2 referentes */
--r:8px; --rc:6px; --gap:16px;
```
- Botón secundario: fondo `#e5e8e3`, texto en tinta.
- Tipografía: **Poppins** 400/500/600. Tamaños: 24 (título), 18 (nombre en fichas), 15–16 (títulos de panel), 14 (texto), 13 (etiquetas y sublíneas). **Nada por debajo de 12px.**
- Números con `font-variant-numeric: tabular-nums`. Cifras a peso 500, no negrita.
- Avatares: iniciales sobre un tono pálido propio de cada referente (`hsl(h 40% 92%)` con texto `hsl(h 40% 26%)`).

## Componentes
- **Fila de referente:** avatar 36px, nombre (500), barrio (+ empresa o cargo según el eje), a la derecha "62 / de 60" y debajo una barra de meta de 4px en `--hue`. Seleccionada: fondo `--active` + barra vertical de 3px en tinta a la izquierda. Inactivo: píldora gris "Inactivo".
- **Ficha corta del referente** (panel central): avatar 48px, nombre, tipo. Tres datos según el eje:
  líder → barrio, estado, coordinadores · empresario → empresa, sector, cargo · aliado → partido, cargo político, zona.
  **Nunca dirección ni teléfono.** Luego "Personas vinculadas N de una meta de M" + barra de 8px, y las notas.
- **Árbol de personas:** lista con un tronco vertical (1.5px `#c9cec6`) y una rama corta hacia cada fila. Cada fila: nombre, barrio + puesto, y hasta 2 píldoras de alerta.
- **Píldoras de alerta:** "Sin cédula" y "No vota aquí" (warn) · "2 referentes" (note) · "Sin verificar" y "Sin barrio" (gris).
- **Ficha de la persona:** bloques con título gris de 13px: Datos personales · Votación · Referentes (cada vínculo con eje, coordinador y fecha) · Autorización y notas · Historial. Aviso amarillo arriba si tiene más de un referente. Cédula y celular enmascarados en las listas, completos solo en esta ficha (con permiso).
- **Cifras del eje** (un solo contenedor dividido): Personas en este eje · Votan en Valledupar · Con datos por completar · También en otro eje.
- **Vacíos:** cada panel tiene su mensaje ("Elija un referente para ver sus personas").

## Responsive
- ≥ 1280px: tres paneles.
- 860–1280px: dos paneles; la ficha de la persona baja a ancho completo.
- < 860px: un paso a la vez (referentes → personas → ficha) con botón "Volver"; las pestañas de ejes se desplazan horizontalmente.

## Accesibilidad
Todo se usa con teclado (Tab y Enter), foco visible en verde oscuro, contraste mínimo 4.5:1 en texto.
