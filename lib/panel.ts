import type { PanelBarrio, PanelReferente } from "./tipos";

export const CUANTOS_REFERENTES = 5;
export const CUANTOS_BARRIOS = 10;

const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
  a.nombre.localeCompare(b.nombre, "es");

// Los que más personas tienen; empate por nombre.
export function mejores(refs: PanelReferente[], n = CUANTOS_REFERENTES) {
  return [...refs]
    .sort((a, b) => b.total_personas - a.total_personas || porNombre(a, b))
    .slice(0, n);
}

// Los que menos personas tienen (incluye los que tienen 0), sin repetir
// a los que ya salen entre los mejores.
export function conMenos(refs: PanelReferente[], n = CUANTOS_REFERENTES) {
  const top = new Set(mejores(refs, n).map((r) => r.id));
  return refs
    .filter((r) => !top.has(r.id))
    .sort((a, b) => a.total_personas - b.total_personas || porNombre(a, b))
    .slice(0, n);
}

// Barrios: los que más personas tienen y los que menos, sin repetir barrios
// entre las dos listas. "Sin barrio" va aparte.
export function rankingBarrios(barrios: PanelBarrio[], n = CUANTOS_BARRIOS) {
  const sinBarrio = barrios.find((b) => b.sin_barrio)?.personas ?? 0;
  const porNombreBarrio = (a: PanelBarrio, b: PanelBarrio) => a.barrio.localeCompare(b.barrio, "es");
  const orden = barrios
    .filter((b) => !b.sin_barrio)
    .sort((a, b) => b.personas - a.personas || porNombreBarrio(a, b));
  return {
    mas: orden.slice(0, n),
    // del que menos tiene hacia arriba; empates en orden alfabético
    menos: orden
      .slice(n)
      .slice(-n)
      .sort((a, b) => a.personas - b.personas || porNombreBarrio(a, b)),
    total: orden.length,
    sinBarrio,
  };
}

// Ancho de una barra (0–100), con tope en 100.
export const anchoBarra = (pct: number | null) => Math.max(0, Math.min(100, pct ?? 0));
