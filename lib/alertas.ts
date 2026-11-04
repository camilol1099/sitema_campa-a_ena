import type { Verificacion } from "./ejes";

export type Alerta = { tono: "aviso" | "nota" | "gris"; texto: string };

// Píldoras de alerta de una persona (DESIGN.md), en orden de importancia.
export function alertasPersona(p: {
  sin_cedula: boolean;
  num_referentes: number;
  municipio_verificacion: Verificacion | null;
  barrio: string | null;
}): Alerta[] {
  const a: Alerta[] = [];
  if (p.sin_cedula) a.push({ tono: "aviso", texto: "Sin cédula" });
  if (p.num_referentes > 1) a.push({ tono: "nota", texto: `${p.num_referentes} referentes` });
  if (!p.municipio_verificacion) a.push({ tono: "gris", texto: "Sin verificar" });
  else if (p.municipio_verificacion !== "Valledupar") a.push({ tono: "aviso", texto: "No vota aquí" });
  if (!p.barrio?.trim()) a.push({ tono: "gris", texto: "Sin barrio" });
  return a;
}
