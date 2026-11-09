import type { TipoReferente } from "../ejes";
import { normalizar } from "../importacion";

// Cálculos puros para las herramientas del asistente (se prueban sin red).

export type RefConteo = { id: string; nombre: string; tipo: TipoReferente; personas: number };
export type Orden = "mas" | "menos" | "nombre";

/** Ordena referentes por número de personas (desc o asc) o por nombre; empate → por nombre. */
export function ordenarReferentes<T extends { nombre: string; personas: number }>(lista: T[], orden: Orden): T[] {
  const porNombre = (a: T, b: T) => normalizar(a.nombre).localeCompare(normalizar(b.nombre), "es");
  return [...lista].sort((a, b) =>
    orden === "nombre" ? porNombre(a, b) : (orden === "mas" ? b.personas - a.personas : a.personas - b.personas) || porNombre(a, b),
  );
}

/** Una página de la lista (desde = posición inicial, 0 = primera). */
export function pagina<T>(lista: T[], desde: number, max: number) {
  const inicio = Math.max(0, Math.min(Math.trunc(desde) || 0, lista.length));
  const filas = lista.slice(inicio, inicio + max);
  const siguiente = inicio + filas.length < lista.length ? inicio + filas.length : null;
  return { total: lista.length, desde: inicio, filas, siguiente };
}

/**
 * Cuenta personas por referente a partir de vínculos (persona, referente).
 * Una persona cuenta una sola vez por referente aunque el vínculo se repita.
 */
export function contarPorReferente(
  vinculos: { persona_id: string; referente: { id: string; nombre: string; tipo: TipoReferente } }[],
): { referentes: RefConteo[]; personas: number } {
  const porRef = new Map<string, RefConteo & { vistos: Set<string> }>();
  const todas = new Set<string>();
  for (const v of vinculos) {
    todas.add(v.persona_id);
    let r = porRef.get(v.referente.id);
    if (!r) {
      r = { ...v.referente, personas: 0, vistos: new Set() };
      porRef.set(v.referente.id, r);
    }
    if (!r.vistos.has(v.persona_id)) {
      r.vistos.add(v.persona_id);
      r.personas++;
    }
  }
  const referentes = ordenarReferentes(
    [...porRef.values()].map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, personas: r.personas })),
    "mas",
  );
  return { referentes, personas: todas.size };
}
