import Link from "next/link";
import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";
import { iniciales, tono } from "@/lib/formato";

// Componentes visuales compartidos (estilo "Vidrio verde", ver DESIGN.md).
// Los colores, radios y sombras salen de los tokens de globals.css.

// ---------------------------------------------------------------------------
// Vidrio: superficie grande translúcida. Único lugar con backdrop-filter
// (además de diálogo, aviso flotante y login). Nunca en filas de listas.
// ---------------------------------------------------------------------------
export function Vidrio<T extends ElementType = "div">({
  como,
  fuerte = false,
  barra = false,
  className = "",
  children,
  ...props
}: {
  como?: T;
  /** Paneles de datos: más opaco para que el texto se lea siempre bien. */
  fuerte?: boolean;
  /** Barra superior fija: casi opaca para que el contenido no se vea a través al bajar. */
  barra?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "className" | "children">) {
  const Comp = (como ?? "div") as ElementType;
  return (
    <Comp
      {...props}
      className={`border border-glass-line shadow-vidrio backdrop-vidrio ${barra ? "bg-glass-bar" : fuerte ? "bg-glass-strong" : "bg-glass"} ${className}`}
    >
      {children}
    </Comp>
  );
}

// ---------------------------------------------------------------------------
// Botones: principal (degradado, uno por zona) y secundario (relieve).
// claseBoton sirve también para enlaces que se ven como botón.
// ---------------------------------------------------------------------------
type Variante = "pri" | "sec";
type Tam = "normal" | "sm";

export function claseBoton(variante: Variante = "sec", tam: Tam = "normal") {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold cursor-pointer select-none " +
    "transition duration-150 disabled:cursor-not-allowed disabled:opacity-60";
  const medida = tam === "sm" ? "h-[34px] px-3.5 text-[13px] rounded-[12px]" : "h-10 px-[18px] rounded-ctl";
  const color =
    variante === "pri"
      ? "bg-grad text-white shadow-[0_10px_20px_-8px_rgba(33,72,32,.6),inset_0_1px_0_rgba(255,255,255,.35)] " +
        "hover:brightness-107 hover:-translate-y-px active:translate-y-0 active:brightness-96 disabled:hover:translate-y-0"
      : "bg-neu text-ink shadow-neu-out hover:text-brand active:shadow-neu-in";
  return `${base} ${medida} ${color}`;
}

export function Boton({
  variante = "sec",
  tam = "normal",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tam?: Tam }) {
  return <button type={type} {...props} className={`${claseBoton(variante, tam)} ${className}`} />;
}

// ---------------------------------------------------------------------------
// Pestañas: riel hundido; la activa es una pastilla blanca en relieve.
// ---------------------------------------------------------------------------
export type Pestana = { href: string; texto: string; conteo?: number; activa: boolean };

export function Pestanas({ items, etiqueta, className = "" }: { items: Pestana[]; etiqueta: string; className?: string }) {
  return (
    <nav aria-label={etiqueta} className={`flex gap-1 overflow-x-auto rounded-[16px] bg-neu p-[5px] shadow-neu-in ${className}`}>
      {items.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.activa ? "page" : undefined}
          className={`flex h-[38px] flex-none items-center gap-2 rounded-[12px] px-3.5 whitespace-nowrap transition duration-150 ${
            p.activa ? "bg-white font-semibold text-brand shadow-neu-out-sm" : "font-medium text-muted hover:text-ink"
          }`}
        >
          {p.texto}
          {p.conteo !== undefined && (
            <span
              className={`num rounded-full px-[7px] text-[12px] leading-[18px] font-medium ${
                p.activa ? "bg-brand-2/16 text-brand" : "bg-brand/8 text-muted"
              }`}
            >
              {p.conteo}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Filtros: control segmentado (riel hundido, opción elegida en relieve).
// ---------------------------------------------------------------------------
export function Filtros<K extends string>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
  className = "",
}: {
  opciones: [K, string][];
  valor: K;
  alCambiar: (k: K) => void;
  etiqueta: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className={`flex gap-1 rounded-ctl bg-neu p-1 shadow-neu-in ${className}`}>
      {opciones.map(([k, t]) => (
        <button
          key={k}
          type="button"
          aria-pressed={valor === k}
          onClick={() => alCambiar(k)}
          className={`h-8 flex-1 cursor-pointer rounded-[10px] px-2 text-[13px] transition duration-150 ${
            valor === k ? "bg-white font-semibold text-brand shadow-neu-out-sm" : "font-medium text-muted hover:text-ink"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra de avance: riel hundido + relleno con el degradado de la marca.
// ---------------------------------------------------------------------------
export function BarraAvance({
  pct,
  fina = false,
  etiqueta,
  className = "",
}: {
  pct: number;
  /** 6px en filas de lista; 10px en fichas y tarjetas. */
  fina?: boolean;
  etiqueta?: string;
  className?: string;
}) {
  const ancho = Math.max(0, Math.min(100, pct));
  return (
    <span
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      title={etiqueta}
      className={`block overflow-hidden rounded-full bg-neu shadow-neu-in ${fina ? "h-1.5" : "h-2.5"} ${className}`}
    >
      <i
        className="block h-full rounded-full bg-grad shadow-[inset_0_1px_0_rgba(255,255,255,.4)] transition-[width] duration-500"
        style={{ width: `${ancho}%` }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Píldoras: gris (blanca translúcida), aviso (naranja) y nota (amarilla).
// ---------------------------------------------------------------------------
type TonoPildora = "aviso" | "nota" | "gris";
export function Pildora({ tono: t = "gris", children }: { tono?: TonoPildora; children: ReactNode }) {
  const color =
    t === "aviso"
      ? "bg-warn text-warn-ink"
      : t === "nota"
        ? "bg-note text-note-ink"
        : "bg-white/75 text-muted ring-1 ring-linea ring-inset";
  return (
    <span className={`inline-block rounded-full px-[9px] text-[12px] leading-5 whitespace-nowrap ${color}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar: cuadrado redondeado con iniciales sobre un degradado pálido
// verde-amarillo propio de cada referente.
// ---------------------------------------------------------------------------
export function Avatar({ id, nombre, tamano = 40 }: { id: string; nombre: string; tamano?: 40 | 54 }) {
  const h = 90 + (tono(id) % 80);
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_4px_10px_-6px_rgba(0,0,0,.25)] ${
        tamano === 54 ? "h-[54px] w-[54px] rounded-[18px] text-[16px]" : "h-10 w-10 rounded-ctl text-[12.5px]"
      }`}
      style={{
        background: `linear-gradient(145deg, hsl(${h} 45% 90%), hsl(${h} 40% 80%))`,
        color: `hsl(${h} 45% 22%)`,
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-muted">{children}</div>;
}

export const Guion = () => <span className="font-normal text-faint">—</span>;

// ---------------------------------------------------------------------------
// Íconos de trazo simple
// ---------------------------------------------------------------------------
const svg = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
export const IconoMas = () => (
  <svg {...svg} strokeWidth={2}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);
export const IconoLapiz = () => (
  <svg {...svg}>
    <path d="m10.5 3 2.5 2.5L6 12.5 3 13l.5-3z" />
  </svg>
);
export const IconoEnlace = () => (
  <svg {...svg}>
    <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
  </svg>
);
export const IconoVolver = () => (
  <svg {...svg}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </svg>
);
export const IconoBuscar = () => (
  <svg {...svg}>
    <circle cx="7" cy="7" r="4.8" />
    <path d="m10.6 10.6 3.4 3.4" />
  </svg>
);

// Íconos de las tarjetas de cifras (24px, dentro de un cuadro en relieve)
const svg24 = { ...svg, width: 18, height: 18, viewBox: "0 0 24 24", strokeWidth: 1.9 };
export const IconoPersonas = () => (
  <svg {...svg24}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14.5a5 5 0 0 1 4.5 5" />
  </svg>
);
export const IconoCheck = () => (
  <svg {...svg24}>
    <path d="m5 12 4.5 4.5L19 7" />
  </svg>
);
export const IconoAlerta = () => (
  <svg {...svg24}>
    <path d="M12 8v5M12 16.5v.5" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);
export const IconoCruce = () => (
  <svg {...svg24}>
    <path d="M7 7h11l-3-3M17 17H6l3 3" />
  </svg>
);
