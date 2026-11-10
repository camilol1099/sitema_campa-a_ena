// Archivos CSV para la copia de seguridad.
// - Separador ";" y BOM UTF-8: Excel en español (Colombia) los abre con columnas
//   y tildes correctas con doble clic.
// - Fin de línea CRLF; comillas solo cuando hacen falta.
// - Protección contra fórmulas (CSV injection): si un texto empieza por = o @,
//   o por + / - sin ser un número, se antepone un apóstrofo para que Excel no
//   lo ejecute. Los números y teléfonos (+57 300…) quedan tal cual.

export const SEPARADOR = ";";
const BOM = "﻿";

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let t: string;
  if (typeof valor === "string") t = valor;
  else if (typeof valor === "number" || typeof valor === "boolean") t = String(valor);
  else t = JSON.stringify(valor);

  if (/^[=@\t\r]/.test(t) || (/^[+-]/.test(t) && !/^[+-][\d\s.,]*$/.test(t))) t = "'" + t;
  if (t.includes(SEPARADOR) || t.includes('"') || t.includes("\n") || t.includes("\r")) {
    t = '"' + t.replace(/"/g, '""') + '"';
  }
  return t;
}

/** Arma el CSV con las columnas en el orden dado. */
export function aCsv(columnas: string[], filas: Record<string, unknown>[]): string {
  const lineas = [columnas.map(celda).join(SEPARADOR)];
  for (const f of filas) lineas.push(columnas.map((c) => celda(f[c])).join(SEPARADOR));
  return BOM + lineas.join("\r\n") + "\r\n";
}
