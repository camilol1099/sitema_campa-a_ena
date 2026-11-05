import { sinTildes } from "./filtros";

// Listas de barrios, municipios y puestos de votación (tablas de la base).
// Los formularios eligen de la lista; si no aparece, se puede agregar uno
// nuevo. Así un mismo barrio no queda escrito de varias formas.

export const CATALOGOS = {
  barrio: { tabla: "barrios", uno: "barrio", max: 80 },
  municipio: { tabla: "municipios", uno: "municipio", max: 80 },
  puesto_votacion: { tabla: "puestos_votacion", uno: "puesto de votación", max: 120 },
} as const;

export type Catalogo = keyof typeof CATALOGOS;
export type Catalogos = Record<Catalogo, string[]>;

export const CATALOGOS_VACIOS: Catalogos = { barrio: [], municipio: [], puesto_votacion: [] };

// Sufijo del campo oculto que indica "agregar como nuevo" (barrio_nuevo = "1").
export const SUFIJO_NUEVO = "_nuevo";

// Quita espacios al inicio, al final y dobles.
export const limpiarNombre = (t: string) => t.trim().replace(/\s+/g, " ");

// Clave para comparar: sin tildes, sin mayúsculas, sin puntos ni espacios de más.
// "San Martin", "SAN MARTÍN" y "san  martín" son el mismo barrio.
export const claveNombre = (t: string) =>
  sinTildes(limpiarNombre(t)).replace(/\./g, "").replace(/\s+/g, " ").trim();

// Busca un nombre en la lista sin importar tildes ni mayúsculas.
export function buscarEnLista(lista: string[], texto: string): string | null {
  const k = claveNombre(texto);
  if (!k) return null;
  return lista.find((n) => claveNombre(n) === k) ?? null;
}

// Opciones que coinciden con lo escrito (todas si no hay texto).
export function filtrarLista(lista: string[], texto: string): string[] {
  const k = claveNombre(texto);
  const orden = [...lista].sort((a, b) => a.localeCompare(b, "es"));
  if (!k) return orden;
  const empiezan = orden.filter((n) => claveNombre(n).startsWith(k));
  const contienen = orden.filter((n) => !claveNombre(n).startsWith(k) && claveNombre(n).includes(k));
  return [...empiezan, ...contienen];
}

// Letras (con tildes y ñ), números, espacios y . , - # ° º ' ( ) /
const PERMITIDOS = /^[\p{L}\p{N} .,\-#°º'()/]+$/u;

export function validarNombreNuevo(nombre: string, cat: Catalogo): string | null {
  const { uno, max } = CATALOGOS[cat];
  if (nombre.length < 2) return `El nombre del ${uno} es muy corto.`;
  if (nombre.length > max) return `El nombre del ${uno} es muy largo (máximo ${max} letras).`;
  if (!PERMITIDOS.test(nombre)) return `El nombre del ${uno} tiene caracteres no permitidos.`;
  if (!/\p{L}/u.test(nombre)) return `El nombre del ${uno} debe tener letras.`;
  return null;
}

// Lee un campo de catálogo del formulario.
// - Vacío → null.
// - Igual a uno de la lista (sin importar tildes o mayúsculas) → el de la lista.
// - Distinto y marcado como nuevo → se valida y se agrega (`nuevo`).
// - Distinto y sin marcar → error: debe elegirse de la lista.
export function leerCatalogo(
  formData: FormData,
  cat: Catalogo,
  lista: string[],
): { valor: string | null; nuevo: string | null; error: string | null } {
  const texto = limpiarNombre(String(formData.get(cat) ?? ""));
  if (!texto) return { valor: null, nuevo: null, error: null };

  const existente = buscarEnLista(lista, texto);
  if (existente) return { valor: existente, nuevo: null, error: null };

  if (formData.get(cat + SUFIJO_NUEVO) !== "1") {
    return {
      valor: null,
      nuevo: null,
      error: `Elige un ${CATALOGOS[cat].uno} de la lista o agrégalo como nuevo.`,
    };
  }
  const error = validarNombreNuevo(texto, cat);
  return error ? { valor: null, nuevo: null, error } : { valor: texto, nuevo: texto, error: null };
}
