import { CAMPOS_TIPO } from "./ejes";
import type { ReferenteFicha, ReferenteResumen } from "./tipos";

// Porcentaje de avance hacia la meta (0–100). Sin meta, 0.
export function porcentajeMeta(total: number, meta: number | null) {
  if (!meta) return 0;
  return Math.min(100, (total / meta) * 100);
}

// Cuántos referentes ya alcanzaron su meta (los que no tienen meta no cuentan).
export function cuantosCumplenMeta(
  referentes: Pick<ReferenteResumen, "meta_personas" | "total_personas">[],
) {
  return referentes.filter((r) => r.meta_personas && r.total_personas >= r.meta_personas)
    .length;
}

// Coordinadores distintos de las personas de un referente.
export function coordinadoresDistintos(personas: { coordinador: string | null }[]) {
  return [...new Set(personas.map((p) => p.coordinador).filter(Boolean))] as string[];
}

// Tres datos de la ficha corta según el eje. Nunca dirección ni teléfono.
// líder → barrio, estado, coordinadores · empresario → empresa, sector, cargo ·
// aliado → partido, cargo político, zona.
export function datosFichaReferente(
  r: ReferenteFicha,
  coordinadores: string[],
): [string, string | null][] {
  if (r.tipo === "lider") {
    return [
      ["Barrio", r.barrio],
      ["Estado", r.estado === "activo" ? "Activo" : "Inactivo"],
      ["Coordinadores", coordinadores.length ? String(coordinadores.length) : null],
    ];
  }
  return CAMPOS_TIPO[r.tipo].map(({ campo, etiqueta }) => [etiqueta, r[campo]]);
}
