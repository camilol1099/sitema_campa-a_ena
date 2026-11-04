import type { EventoHistorial } from "./tipos";

const ETIQUETAS: Record<string, string> = {
  nombre: "nombre",
  cedula: "cédula",
  celular: "celular",
  direccion: "dirección",
  barrio: "barrio",
  municipio_verificacion: "verificación",
  puesto_votacion: "puesto",
  mesa: "mesa",
  observaciones: "observaciones",
  autorizacion_datos: "autorización",
  fecha_autorizacion: "fecha de autorización",
  coordinador: "coordinador",
  activo: "estado del vínculo",
  nota: "nota",
  fecha_vinculo: "fecha del vínculo",
};
const IGNORAR = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

// Texto corto de un cambio del historial, p. ej. "Se editó: mesa, puesto".
// `nombres` traduce id de referente → nombre.
export function describirCambio(e: EventoHistorial, nombres: Map<string, string>) {
  const antes = e.cambios?.antes ?? {};
  const despues = e.cambios?.despues ?? {};
  const refId = String(despues.referente_id ?? antes.referente_id ?? "");
  const ref = nombres.get(refId) ?? "un referente";

  if (e.tabla === "vinculos") {
    if (e.accion === "vincular") return `Se vinculó a ${ref}`;
    if (e.accion === "desvincular") return `Se desvinculó de ${ref}`;
    if (antes.activo === false && despues.activo === true) return `Se volvió a vincular a ${ref}`;
  } else if (e.accion === "crear") {
    return "Registro creado";
  }
  const campos = Object.keys(despues)
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => ETIQUETAS[k] ?? k);
  const que = campos.length ? `: ${campos.join(", ")}` : "";
  return e.tabla === "vinculos" ? `Se editó el vínculo con ${ref}${que}` : `Se editó${que}`;
}
