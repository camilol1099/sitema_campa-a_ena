import { slugDeTipo, type TipoReferente } from "./ejes";

// Direcciones de la pantalla de ejes: /<eje>?referente=<id>&persona=<id>

export function rutaReferente(tipo: TipoReferente, referenteId: string) {
  return `/${slugDeTipo(tipo)}?referente=${referenteId}`;
}

// Abre una persona en el eje y referente indicados; si no tiene referente,
// se abre sola en el eje de líderes.
export function rutaPersona(
  personaId: string,
  referente?: { id: string; tipo: TipoReferente } | null,
) {
  if (!referente) return `/lideres?persona=${personaId}`;
  return `${rutaReferente(referente.tipo, referente.id)}&persona=${personaId}`;
}
