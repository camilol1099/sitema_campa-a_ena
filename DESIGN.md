# Diseño de la interfaz — estilo "Vidrio verde"

Referencia visual: `diseno-vidrio.html` (en la raíz) (ábrela en el navegador: login → panel → ejes). **Implementa ese diseño**, no uno propio.
Si algo no está aquí ni en la referencia, pregunta antes de inventarlo.

## Idea central
La información es un árbol: **eje → referente → personas → ficha de la persona**.
La pantalla lo muestra de izquierda a derecha en **tres paneles**, sin menú lateral.

## Estilo
**Glassmorphism** en las superficies grandes (barra superior, paneles, tarjetas) + **neomorfismo suave** en los controles (botones secundarios, campos, pestañas, filtros, barras de avance).
- Fondo de la app: color base `--bg` con manchas **suaves** (opacidad baja, ajustado a pedido de la clienta) de color de la marca **fijas** (`position:fixed`, degradados radiales: verde claro arriba a la izquierda, verde oscuro abajo a la derecha, un toque de naranja arriba a la derecha). Es lo que el vidrio deja ver.
- Superficies de vidrio: blanco translúcido + `backdrop-filter: blur(22px) saturate(165%)` + borde blanco de 1px + sombra suave verde con brillo interior arriba.
- Paneles de datos (listas, ficha): vidrio **más opaco** (`--glass-strong`) para que el texto se lea siempre bien.
- Barra superior: vidrio **casi opaco** (`--glass-bar`), porque queda fija encima del contenido al bajar y no debe dejar ver el texto de abajo.
- Controles neomórficos sobre `--neu-bg`: en reposo **en relieve** (`--neu-out`), campos y rieles **hundidos** (`--neu-in`), presionado = hundido.
- Elemento activo (pestaña, filtro, fila o persona seleccionada): pastilla **blanca** en relieve; la fila de referente seleccionada lleva además una barra vertical de 4px con el degradado verde.
- Botón principal: degradado verde de la marca con sombra verde y brillo arriba. **Uno por zona.**
- Naranja `#e8431e`: solo como acento de fondo y en errores; nunca en botones.

### Tokens
```css
--bg:#e6eee5;
--ink:#10200e; --muted:#4c5a49; --faint:#5f6c5c;
--brand:#214820; --brand-2:#48a733; --accent:#e8431e;
--glass:rgba(255,255,255,.74); --glass-strong:rgba(255,255,255,.9); --glass-bar:rgba(244,248,243,.94); --glass-line:rgba(255,255,255,.8);
--blur:blur(22px) saturate(165%);
--shadow:0 18px 40px -18px rgba(16,48,14,.30),0 2px 6px -2px rgba(16,48,14,.08),inset 0 1px 0 rgba(255,255,255,.9);
--neu-bg:#edf2ec;
--neu-out:5px 5px 12px rgba(33,72,32,.13),-5px -5px 12px rgba(255,255,255,.9);
--neu-out-sm:3px 3px 7px rgba(33,72,32,.12),-3px -3px 7px rgba(255,255,255,.9);
--neu-in:inset 3px 3px 7px rgba(33,72,32,.13),inset -3px -3px 7px rgba(255,255,255,.95);
--grad:linear-gradient(135deg,#4fb437 0%,#2f7a26 45%,#214820 100%);
--warn-bg:#fde4d9; --warn-ink:#9a3412;   /* sin cédula, no vota aquí, sin autorización */
--note-bg:#fff1bf; --note-ink:#6f4a00;   /* 2 referentes, notas */
--r-pane:24px; --r-card:18px; --r-ctl:14px; --gap:18px;
```
Ponlos como variables CSS globales y en `tailwind.config` (colores, radios y sombras con nombre), no repetidos a mano.

### Tipografía y espacios
- **Poppins** 400/500/600/700/800 (con `next/font`). Títulos de pantalla 30/700; números grandes 30–40/700–800; nombres en fichas 19–20/700; títulos de panel 16/700; texto 14; etiquetas 12–13. **Nada por debajo de 12px.**
- Números con `tabular-nums`.
- Espaciado generoso: paneles con 18–22px de relleno, separación entre paneles 18px, filas de lista con 12px y separadas 6px (sin líneas divisorias).
- Avatares: cuadrados redondeados (14px) con iniciales sobre un degradado pálido de tono verde-amarillo propio de cada referente.

## Login
- Pantalla completa con la foto **#AhoraNosotros** de fondo (`public/marca/foto-ahora-nosotros.webp`), cubierta por un degradado verde oscuro para que el texto se lea.
- Izquierda: imagotipo blanco (`public/marca/imagotipo-blanco.png`), el lema **#AhoraNosotros** grande (el `#` en verde claro `#9be07f`), una línea de texto y "Acceso privado del equipo de campaña".
- Derecha: tarjeta de **vidrio oscuro** (blanco 12% + blur 26px + borde blanco 28%) con el isotipo, "Bienvenida de nuevo", campos hundidos con ícono, botón para ver la contraseña, botón "Ingresar" con degradado, y la nota de información protegida.
- Error: caja naranja translúcida dentro de la tarjeta ("Correo o contraseña incorrectos."). Nunca decir cuál de los dos falló.
- Móvil: la marca arriba y la tarjeta debajo, una sola columna.

## Estructura de la app
```
╭ Barra superior flotante de vidrio (66px, a 12px de los bordes, radio 22) ─────────────────────╮
│ [logo] Jesús Perpiñán  ( Panel | Líderes 10 | Empresarios 4 | Aliados 4 )   [Buscar  /] [AS] │
╰───────────────────────────────────────────────────────────────────────────────────────────────╯
  Título (30px) + frase con el hallazgo                          [Nueva persona] [+ Nuevo líder]
  ╭ cifra ╮ ╭ cifra ╮ ╭ cifra ╮ ╭ cifra ╮   ← 4 tarjetas de vidrio separadas, con ícono en relieve
  ╭ Referentes 350 ╮ ╭ Referente + sus personas (1fr) ╮ ╭ Ficha de la persona 396 ╮
```
- Pestañas en un **riel hundido**; la activa es una pastilla blanca en relieve con el número en verde.
- El avatar (AS) cierra sesión.
- Rutas: `/panel`, `/lideres`, `/empresarios`, `/aliados`, con `?referente=<id>&persona=<id>`.

## Componentes
- **Fila de referente:** avatar 40px, nombre 600, barrio (+ empresa o cargo), a la derecha el número (700) y "de 60"; debajo barra de meta de 6px (riel hundido + relleno con degradado).
- **Ficha corta del referente:** tarjeta blanca en relieve dentro del panel; tres datos según el eje en **casillas hundidas**. **Nunca dirección ni teléfono.** Barra de avance de 10px y nota amarilla.
- **Árbol de personas:** tronco de 2px con degradado verde y ramas cortas; cada persona es una fila que al seleccionarse se vuelve pastilla blanca en relieve.
- **Ficha de la persona:** cabecera con un leve degradado verde, botones Editar (principal) y Vincular (secundario); bloques en tarjetas blancas en relieve con título en mayúsculas pequeñas (12px, gris, espaciado .06em).
- **Píldoras:** blancas translúcidas (gris), warn y note como en los tokens.
- **Panel de avance:** tres tarjetas grandes por eje (número de 40px, barra de avance; al hacer clic llevan al eje), y debajo cuatro cajas: "Quiénes van atrás", "Mejores referentes", "Barrios con más personas" y "Calidad de datos" (seis casillas en relieve).
- **Aviso flotante (toast):** vidrio oscuro abajo al centro.
- **Diálogos y formularios** (cuando existan): tarjeta de vidrio fuerte centrada, fondo oscurecido con blur, campos hundidos, botones como arriba.

## Rendimiento
- `backdrop-filter` **solo** en superficies grandes (barra, paneles, tarjetas, diálogos). **Nunca** en filas de listas ni en elementos repetidos.
- El fondo de manchas es un solo elemento fijo, sin animación.
- Respeta `prefers-reduced-motion` (sin transiciones).

## Responsive
- ≥ 1280px: tres paneles.
- 860–1280px: dos paneles; la ficha baja a ancho completo; cifras en 2 columnas.
- < 860px: un paso a la vez (referentes → personas → ficha) con botón "Volver"; la barra superior se reacomoda en dos filas y las pestañas se desplazan horizontalmente.

## Accesibilidad
- Contraste mínimo 4.5:1 en texto: por eso los paneles de datos usan `--glass-strong` y el texto gris es `--muted`, no más claro.
- Todo se usa con teclado; foco visible en `--brand-2`.
- Campos con `<label>` real, `autocomplete` en el login, botón de ver contraseña con `aria-label`.
