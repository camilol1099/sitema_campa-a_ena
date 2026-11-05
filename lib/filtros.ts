import type { ReferenteResumen } from "./tipos";

// Minúsculas y sin tildes, para comparar nombres ("Jesus" = "Jesús").
export function sinTildes(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Si lo escrito es una cédula (números, con o sin puntos, comas o espacios),
// devuelve solo los dígitos; si no, null.
export function digitosCedula(texto: string): string | null {
  const t = texto.trim();
  if (!/^[0-9][0-9 .,'-]*$/.test(t)) return null;
  return t.replace(/[^0-9]/g, "");
}

// Lista de referentes del panel izquierdo: filtra por nombre o por cédula
// (cualquier parte) y ordena por personas vinculadas
// (más primero) y luego por nombre.
export function filtrarReferentes<
  R extends Pick<ReferenteResumen, "nombre" | "total_personas"> & { cedula?: string | null },
>(referentes: R[], texto: string): R[] {
  const digitos = digitosCedula(texto);
  const q = sinTildes(texto.trim());
  const coincide = (r: R) => {
    if (!q) return true;
    if (digitos !== null) return !!r.cedula?.includes(digitos);
    return sinTildes(r.nombre).includes(q);
  };
  return referentes
    .filter(coincide)
    .sort((a, b) => b.total_personas - a.total_personas || a.nombre.localeCompare(b.nombre));
}
