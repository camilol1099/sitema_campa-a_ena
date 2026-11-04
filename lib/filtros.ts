import type { ReferenteResumen } from "./tipos";

// Minúsculas y sin tildes, para comparar nombres ("Jesus" = "Jesús").
export function sinTildes(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type FiltroEstado = "activos" | "todos" | "inactivos";

// Lista de referentes del panel izquierdo: filtra por estado y por nombre,
// y ordena por personas vinculadas (más primero) y luego por nombre.
export function filtrarReferentes<
  R extends Pick<ReferenteResumen, "nombre" | "estado" | "total_personas">,
>(referentes: R[], texto: string, filtro: FiltroEstado): R[] {
  const q = sinTildes(texto.trim());
  return referentes
    .filter((r) => filtro === "todos" || (filtro === "activos") === (r.estado === "activo"))
    .filter((r) => !q || sinTildes(r.nombre).includes(q))
    .sort((a, b) => b.total_personas - a.total_personas || a.nombre.localeCompare(b.nombre));
}
