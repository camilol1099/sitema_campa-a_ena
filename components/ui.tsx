import type { ReactNode } from "react";
import { iniciales, tono } from "@/lib/formato";

// Botones con borde, color y una animación corta al pasar y al presionar.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap cursor-pointer " +
  "transition duration-150 ease-out motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

export const boton = {
  primario: `${BASE} h-9 px-3.5 border-primary bg-primary text-white hover:bg-primary-hover hover:shadow-[0_4px_12px_-4px_rgba(33,72,32,.5)]`,
  secundario: `${BASE} h-9 px-3.5 border-control bg-surface text-ink hover:border-ink hover:bg-raised hover:shadow-[0_4px_12px_-6px_rgba(20,26,18,.35)]`,
  primarioSm: `${BASE} h-[30px] px-2.5 text-[13px] border-primary bg-primary text-white hover:bg-primary-hover hover:shadow-[0_4px_10px_-4px_rgba(33,72,32,.5)]`,
  secundarioSm: `${BASE} h-[30px] px-2.5 text-[13px] border-control bg-surface text-ink hover:border-ink hover:bg-raised hover:shadow-[0_4px_10px_-6px_rgba(20,26,18,.35)]`,
};

type TonoPildora = "aviso" | "nota" | "gris";
export function Pildora({
  tono: t = "gris",
  children,
}: {
  tono?: TonoPildora;
  children: ReactNode;
}) {
  const color =
    t === "aviso"
      ? "bg-warn text-warn-ink border-warn-ink/15"
      : t === "nota"
        ? "bg-note text-note-ink border-note-ink/15"
        : "bg-[#eef0ec] text-muted border-control/60";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-[7px] text-[12px] leading-[18px] ${color}`}
    >
      {children}
    </span>
  );
}

export function Avatar({
  id,
  nombre,
  tamano = 36,
}: {
  id: string;
  nombre: string;
  tamano?: 36 | 48;
}) {
  const h = tono(id);
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full font-semibold ${
        tamano === 48 ? "h-12 w-12 text-[15px]" : "h-9 w-9 text-[12px]"
      }`}
      style={{ background: `hsl(${h} 40% 92%)`, color: `hsl(${h} 40% 26%)` }}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-muted">{children}</div>;
}

export const Guion = () => <span className="text-faint">—</span>;

// Íconos de trazo simple (sin cuadros de color)
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
  <svg {...svg}>
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
