// Configuración de los tres ejes. Las pantallas son las mismas; solo cambia esto.
export type TipoReferente = "lider" | "empresario" | "aliado";

export const EJES = {
  lideres: { tipo: "lider", titulo: "Líderes", uno: "líder", varios: "líderes" },
  empresarios: { tipo: "empresario", titulo: "Empresarios", uno: "empresario", varios: "empresarios" },
  aliados: { tipo: "aliado", titulo: "Aliados políticos", uno: "aliado", varios: "aliados" },
} as const satisfies Record<
  string,
  { tipo: TipoReferente; titulo: string; uno: string; varios: string }
>;

export type SlugEje = keyof typeof EJES;
export const SLUGS = Object.keys(EJES) as SlugEje[];

// Object.hasOwn y no `in`: `in` también acepta propiedades heredadas de todo
// objeto ("constructor", "toString"…), y /constructor daba error 500.
export function esSlugEje(valor: string): valor is SlugEje {
  return Object.hasOwn(EJES, valor);
}

export function slugDeTipo(tipo: TipoReferente): SlugEje {
  return SLUGS.find((s) => EJES[s].tipo === tipo)!;
}

export function nombreTipo(tipo: TipoReferente) {
  const uno = EJES[slugDeTipo(tipo)].uno;
  return uno[0].toUpperCase() + uno.slice(1);
}

// Campos propios de cada tipo (se muestran en la ficha corta y en el formulario).
export const CAMPOS_TIPO: Record<
  TipoReferente,
  { campo: CampoTipo; etiqueta: string }[]
> = {
  lider: [],
  empresario: [{ campo: "empresa", etiqueta: "Empresa" }],
  aliado: [{ campo: "zona_influencia", etiqueta: "Zona de influencia" }],
};

export type CampoTipo = "empresa" | "zona_influencia";

export const VERIFICACIONES = [
  "Valledupar",
  "No vota en el municipio",
  "No está en el censo",
  "Errado",
  "Cancelado",
] as const;
export type Verificacion = (typeof VERIFICACIONES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}
