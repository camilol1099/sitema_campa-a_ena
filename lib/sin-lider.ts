import { sinTildes } from "./filtros";

// Líder especial para las personas que no tienen líder (pedido del desarrollador,
// 2026-11-06). Así se ven juntas en la lista de líderes y en el panel de Revisión,
// con toda su información guardada. Al asignarles un líder real, salen de aquí.
export const NOMBRE_SIN_LIDER = "Sin líder asignado";

const clave = (t: string) => sinTildes(t).replace(/\s+/g, " ").trim();
export const esSinLider = (nombre: string | null | undefined) => !!nombre && clave(nombre) === clave(NOMBRE_SIN_LIDER);
