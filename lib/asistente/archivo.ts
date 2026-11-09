import { detectarFormatoCampana } from "../campana";
import type { FilaArchivo } from "../importacion";
import { textoCelda } from "../importacion";

// Lectura del Excel o CSV EN EL NAVEGADOR (SheetJS). El archivo no se sube ni
// se guarda: sus filas quedan solo en memoria mientras el panel está abierto.
// Al asistente solo le llega el resumen (hojas, encabezados, 5 filas de ejemplo
// y el número de filas).

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILAS = 5000;

export type Hoja = {
  nombre: string;
  encabezados: string[];
  filas: FilaArchivo[];
  /** Fila del Excel donde están los encabezados (1 = primera). */
  filaEncabezado: number;
};
export type Libro = { nombre: string; hojas: Hoja[] };

// La fila de encabezados: la primera (de las 30 primeras) con casi tantas
// celdas de texto como la fila más llena.
function filaDeEncabezados(aoa: unknown[][]): number {
  const llenas = (f: unknown[]) => f.filter((c) => typeof c === "string" && c.trim()).length;
  const muestra = aoa.slice(0, 30);
  const max = Math.max(0, ...muestra.map(llenas));
  const i = muestra.findIndex((f) => llenas(f) >= Math.max(2, Math.ceil(max * 0.6)));
  return i < 0 ? 0 : i;
}

function nombresUnicos(fila: unknown[]): string[] {
  const vistos = new Map<string, number>();
  return fila.map((c, i) => {
    const base = textoCelda(c) || `Columna ${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

export async function leerArchivo(archivo: File): Promise<Libro> {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo es muy grande (máximo 10 MB).");
  const XLSX = await import("xlsx");
  const esCsv = /\.csv$/i.test(archivo.name);
  const wb = esCsv
    ? XLSX.read(await archivo.text(), { type: "string", raw: false })
    : XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true });

  const hojas: Hoja[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (!ws?.["!ref"]) continue;
    const inicio = XLSX.utils.decode_range(ws["!ref"]).s.r; // fila donde empieza la hoja (0 = fila 1)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: true });
    if (!aoa.length) continue;
    const iEnc = filaDeEncabezados(aoa);
    const encabezados = nombresUnicos(aoa[iEnc] ?? []);
    const datos = aoa.slice(iEnc + 1);
    // Sin las filas vacías del final.
    while (datos.length && (datos.at(-1) ?? []).every((c) => textoCelda(c) === "")) datos.pop();
    const filas = datos.map((f) => Object.fromEntries(encabezados.map((e, j) => [e, f[j] ?? null])));
    hojas.push({ nombre, encabezados, filas, filaEncabezado: inicio + iEnc + 1 });
  }
  if (!hojas.length) throw new Error("El archivo no tiene datos.");
  return { nombre: archivo.name, hojas };
}

/** Resumen para el asistente: nunca el archivo completo. */
export function resumenArchivo(libro: Libro): string {
  const corto = (v: unknown) => {
    const t = textoCelda(v);
    return t.length > 60 ? t.slice(0, 60) + "…" : t;
  };
  const partes = [`[Archivo adjunto: "${libro.nombre}". Solo ves este resumen; el archivo completo queda en el navegador.]`];
  for (const h of libro.hojas.slice(0, 10)) {
    const conDatos = h.filas.filter((f) => Object.values(f).some((v) => textoCelda(v) !== ""));
    // Formato de la campaña: lo entiende el código; al modelo no le hacen falta filas de ejemplo.
    if (detectarFormatoCampana(h.encabezados)) {
      partes.push(`Hoja "${h.nombre}": formato de campaña reconocido (${conDatos.length} filas de datos). Para importarla usa filtrar_importacion; no hace falta mapear.`);
      continue;
    }
    partes.push(
      `Hoja "${h.nombre}": ${conDatos.length} filas de datos. Encabezados (fila ${h.filaEncabezado}): ${h.encabezados.map((e) => `"${e}"`).join(", ")}.`,
      "Ejemplo:",
      ...conDatos.slice(0, 5).map((f) => JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, corto(v)])))),
    );
  }
  if (libro.hojas.length > 10) partes.push(`(Hay ${libro.hojas.length - 10} hojas más.)`);
  return partes.join("\n");
}

/** Encabezados de cada hoja: el servidor los usa para revisar el mapeo. */
export const encabezadosPorHoja = (libro: Libro) =>
  Object.fromEntries(libro.hojas.map((h) => [h.nombre, h.encabezados]));
