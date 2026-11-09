import { CAMPOS_TIPO } from "./ejes";
import type { ReferenteFicha } from "./tipos";

// Coordinadores distintos de las personas de un referente.
export function coordinadoresDistintos(personas: { coordinador: string | null }[]) {
  return [...new Set(personas.map((p) => p.coordinador).filter(Boolean))] as string[];
}

// Votación y coordinador del propio referente (todos los ejes).
function datosVotacion(r: ReferenteFicha): [string, string | null][] {
  const verif = r.municipio_verificacion === "Valledupar" ? "Vota en Valledupar" : r.municipio_verificacion;
  return [
    ["Puesto de votación", r.puesto_votacion],
    ["Mesa", r.mesa === null ? null : String(r.mesa)],
    ["Verificación", verif ?? "Sin verificar"],
    ["Su coordinador", r.coordinador],
  ];
}

// Datos de la ficha corta según el eje. Nunca dirección ni teléfono.
// líder → barrio, coordinadores · empresario → empresa · aliado → zona,
// y en todos: puesto, mesa, verificación y su coordinador.
export function datosFichaReferente(
  r: ReferenteFicha,
  coordinadores: string[],
): [string, string | null][] {
  if (r.tipo === "lider") {
    return [
      ["Barrio", r.barrio],
      ["Coordinadores", coordinadores.length ? String(coordinadores.length) : null],
      ...datosVotacion(r),
    ];
  }
  return [...CAMPOS_TIPO[r.tipo].map(({ campo, etiqueta }): [string, string | null] => [etiqueta, r[campo]]), ...datosVotacion(r)];
}
