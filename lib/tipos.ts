import type { CampoTipo, TipoReferente, Verificacion } from "./ejes";

export type ReferenteResumen = {
  id: string;
  tipo: TipoReferente;
  nombre: string;
  barrio: string | null;
  estado: "activo" | "inactivo";
  meta_personas: number | null;
  empresa: string | null;
  sector: string | null;
  partido_movimiento: string | null;
  cargo_politico: string | null;
  total_personas: number;
};

// Ficha del referente: sin celular ni dirección (no se muestran).
export type ReferenteFicha = {
  id: string;
  tipo: TipoReferente;
  nombre: string;
  cedula: string | null;
  barrio: string | null;
  municipio: string | null;
  estado: "activo" | "inactivo";
  meta_personas: number | null;
  notas: string | null;
} & Record<CampoTipo, string | null>;

// Para el formulario de edición sí se cargan celular y dirección.
export type ReferenteEdicion = ReferenteFicha & {
  celular: string | null;
  direccion: string | null;
};

export type PersonaDeReferente = {
  id: string;
  nombre: string;
  barrio: string | null;
  puesto_votacion: string | null;
  coordinador: string | null;
  sin_cedula: boolean;
  municipio_verificacion: Verificacion | null;
  num_referentes: number;
};

export type Persona = {
  id: string;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  barrio: string | null;
  municipio_verificacion: Verificacion | null;
  puesto_votacion: string | null;
  mesa: number | null;
  observaciones: string | null;
  autorizacion_datos: boolean;
  fecha_autorizacion: string | null;
  origen: "excel_2025" | "manual";
  created_at: string;
};

export type VinculoDePersona = {
  id: string;
  coordinador: string | null;
  fecha_vinculo: string;
  nota: string | null;
  referente: { id: string; nombre: string; tipo: TipoReferente };
};

export type EventoHistorial = {
  id: number;
  tabla: string;
  registro_id: string;
  accion: "crear" | "editar" | "eliminar" | "vincular" | "desvincular";
  cambios: { antes?: Record<string, unknown>; despues?: Record<string, unknown> } | null;
  fecha: string;
};

export type CifrasEje = {
  personas_eje: number;
  total_personas: number;
  votan_valledupar: number;
  por_completar: number;
  en_otro_eje: number;
};

export type ResultadoBusqueda = {
  id: string;
  nombre: string;
  cedula_final: string | null;
  barrio: string | null;
  referente_id: string | null;
  referente_tipo: TipoReferente | null;
  referente_nombre: string | null;
};
