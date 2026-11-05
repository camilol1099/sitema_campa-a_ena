import { CAMPOS_TIPO } from "./ejes";
import type { ReferenteFicha } from "./tipos";

// Coordinadores distintos de las personas de un referente.
export function coordinadoresDistintos(personas: { coordinador: string | null }[]) {
  return [...new Set(personas.map((p) => p.coordinador).filter(Boolean))] as string[];
}

// Datos de la ficha corta según el eje. Nunca dirección ni teléfono.
// líder → barrio, coordinadores · empresario → empresa · aliado → zona.
export function datosFichaReferente(
  r: ReferenteFicha,
  coordinadores: string[],
): [string, string | null][] {
  if (r.tipo === "lider") {
    return [
      ["Barrio", r.barrio],
      ["Coordinadores", coordinadores.length ? String(coordinadores.length) : null],
    ];
  }
  return CAMPOS_TIPO[r.tipo].map(({ campo, etiqueta }) => [etiqueta, r[campo]]);
}
