import type { CampoTipo, TipoReferente, Verificacion } from "./ejes";

export type ReferenteResumen = {
  id: string;
  tipo: TipoReferente;
  nombre: string;
  barrio: string | null;
  empresa: string | null;
  zona_influencia: string | null;
  total_personas: number;
  // Solo para filtrar la lista; no se muestra.
  cedula: string | null;
};

// Ficha del referente: sin celular ni dirección (no se muestran).
export type ReferenteFicha = {
  id: string;
  tipo: TipoReferente;
  nombre: string;
  cedula: string | null;
  barrio: string | null;
  municipio: string | null;
  // Votación y coordinador del propio referente.
  puesto_votacion: string | null;
  mesa: number | null;
  municipio_verificacion: Verificacion | null;
  coordinador: string | null;
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

// ---------- Panel de avance (vistas panel_*) ----------
export type PanelTotal = {
  tipo: TipoReferente;
  referentes: number;
  personas: number;
};

export type PanelReferente = {
  id: string;
  nombre: string;
  tipo: TipoReferente;
  total_personas: number;
};

export type PanelBarrio = {
  barrio: string;
  sin_barrio: boolean;
  personas: number;
};

export type PanelCalidad = {
  sin_cedula: number;
  sin_barrio: number;
  sin_puesto: number;
  sin_verificar: number;
  sin_vinculo: number;
  varios_referentes: number;
};
