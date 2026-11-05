import type { ReferenteResumen } from "./tipos";

// Minúsculas y sin tildes, para comparar nombres ("Jesus" = "Jesús").
export function sinTildes(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Lista de referentes del panel izquierdo: filtra por nombre y ordena por
// personas vinculadas (más primero) y luego por nombre.
export function filtrarReferentes<
  R extends Pick<ReferenteResumen, "nombre" | "total_personas">,
>(referentes: R[], texto: string): R[] {
  const q = sinTildes(texto.trim());
  return referentes
    .filter((r) => !q || sinTildes(r.nombre).includes(q))
    .sort((a, b) => b.total_personas - a.total_personas || a.nombre.localeCompare(b.nombre));
}
