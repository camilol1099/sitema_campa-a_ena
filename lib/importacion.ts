import type { Catalogo, Catalogos } from "./catalogos";
import { SUFIJO_NUEVO } from "./catalogos";
import { VERIFICACIONES, type TipoReferente } from "./ejes";
import { sinTildes } from "./filtros";
import { limpiarCedula } from "./validacion";
import { leerPersona, leerReferente, type FilaPersona, type FilaReferente } from "./formularios";

// Importación desde el asistente, sin IA y sin red:
// 1) aplicarMapeo: columnas del archivo → campos del sistema (+ filtro).
// 2) validarFilas: mismas reglas de los formularios (leerPersona / leerReferente).
// 3) clasificar: nuevos, ya existentes (se omiten) y con problemas.
// Las Server Actions cargan los datos de la base y llaman a estas funciones.

export type TipoImportacion = "persona" | TipoReferente;
export const TIPOS_IMPORTACION: TipoImportacion[] = ["persona", "lider", "empresario", "aliado"];

export const CAMPOS_PERSONA = [
  "nombre", "cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa",
  "municipio_verificacion", "observaciones", "coordinador",
] as const;
export const CAMPOS_REFERENTE = [
  "nombre", "cedula", "celular", "direccion", "barrio", "municipio", "puesto_votacion", "mesa",
  "municipio_verificacion", "coordinador", "empresa", "zona_influencia",
] as const;
export type Campo = (typeof CAMPOS_PERSONA)[number] | (typeof CAMPOS_REFERENTE)[number];

export const camposDeTipo = (tipo: TipoImportacion): readonly Campo[] =>
  tipo === "persona" ? CAMPOS_PERSONA : CAMPOS_REFERENTE;

export type Condicion = {
  columna: string;
  operador: "igual" | "distinto" | "contiene" | "vacio" | "no_vacio";
  valor?: string;
};

export type Mapeo = {
  hoja: string;
  tipo: TipoImportacion;
  /** campo del sistema → nombre de la columna del archivo */
  columnas: Partial<Record<Campo, string>>;
  /** Solo personas: a qué referente vincular (columna con el nombre, o un valor fijo). */
  vinculo?: { modo: "columna"; columna: string } | { modo: "fijo"; referente: string } | null;
  /** Solo personas: el usuario dijo que todas autorizaron el tratamiento de datos. */
  todas_autorizaron?: boolean;
  /** Todas las condiciones deben cumplirse. */
  filtro?: Condicion[];
};

export type FilaArchivo = Record<string, unknown>;

/** Fila ya pasada por el mapeo: textos limpios por campo. `fila` es la fila del archivo (1 = primera de datos). */
export type FilaMapeada = {
  fila: number;
  datos: Partial<Record<Campo, string>>;
  /** nombre (o id) del referente al que vincular, si aplica */
  referente?: string | null;
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Para comparar nombres: sin tildes, minúsculas, espacios simples. */
export const normalizar = (t: string) => sinTildes(t).replace(/\s+/g, " ").trim();

/** Texto de una celda: números sin decimales sobrantes, fechas como AAAA-MM-DD, vacío → "". */
export function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  // Quita caracteres invisibles (marcas de dirección, espacios de ancho cero).
  return String(v).replace(/[​-‏‪-‮⁠﻿]/g, "").replace(/\s+/g, " ").trim();
}

export function cumple(fila: FilaArchivo, c: Condicion): boolean {
  const v = normalizar(textoCelda(fila[c.columna]));
  const x = normalizar(c.valor ?? "");
  switch (c.operador) {
    case "igual": return v === x;
    case "distinto": return v !== x;
    case "contiene": return x !== "" && v.includes(x);
    case "vacio": return v === "";
    case "no_vacio": return v !== "";
  }
}

// ---------------------------------------------------------------------------
// 1. Mapeo
// ---------------------------------------------------------------------------

/** Revisa que el mapeo use columnas que existen y campos del tipo. Devuelve los errores. */
export function revisarMapeo(m: Mapeo, encabezados: string[]): string[] {
  const errores: string[] = [];
  const hay = new Set(encabezados);
  if (!TIPOS_IMPORTACION.includes(m.tipo)) errores.push(`Tipo de registro no válido: ${m.tipo}.`);
  const permitidos = new Set<string>(camposDeTipo(m.tipo));
  if (!m.columnas?.nombre) errores.push("Falta la columna del nombre.");
  for (const [campo, col] of Object.entries(m.columnas ?? {})) {
    if (!col) continue;
    if (!permitidos.has(campo)) errores.push(`El campo "${campo}" no aplica para este tipo.`);
    if (!hay.has(col)) errores.push(`No existe la columna "${col}".`);
  }
  if (m.vinculo && m.tipo !== "persona") errores.push("Solo las personas se vinculan a un referente.");
  if (m.vinculo?.modo === "columna" && !hay.has(m.vinculo.columna)) {
    errores.push(`No existe la columna "${m.vinculo.columna}".`);
  }
  for (const c of m.filtro ?? []) {
    if (!hay.has(c.columna)) errores.push(`El filtro usa una columna que no existe: "${c.columna}".`);
  }
  return errores;
}

/**
 * Aplica el mapeo (y el filtro) a todas las filas del archivo. Omite filas totalmente vacías.
 * `primeraFila`: número de fila en el Excel de la primera fila de datos (para los mensajes).
 */
export function aplicarMapeo(filas: FilaArchivo[], m: Mapeo, primeraFila = 1): FilaMapeada[] {
  const salida: FilaMapeada[] = [];
  filas.forEach((f, i) => {
    if (Object.values(f).every((v) => textoCelda(v) === "")) return;
    if (!(m.filtro ?? []).every((c) => cumple(f, c))) return;
    const datos: Partial<Record<Campo, string>> = {};
    for (const [campo, col] of Object.entries(m.columnas)) {
      if (!col) continue;
      const t = textoCelda(f[col]);
      if (t) datos[campo as Campo] = t;
    }
    let referente: string | null = null;
    if (m.vinculo?.modo === "columna") referente = textoCelda(f[m.vinculo.columna]) || null;
    if (m.vinculo?.modo === "fijo") referente = m.vinculo.referente.trim() || null;
    salida.push({ fila: primeraFila + i, datos, referente });
  });
  return salida;
}

// ---------------------------------------------------------------------------
// 2. Validación (las reglas de los formularios)
// ---------------------------------------------------------------------------

// Celdas que significan "sin dato". ("no" ya no: puede ser un valor real.)
const VACIOS = new Set(["-", "--", "n/a", "na", "sin dato"]);
const SINONIMOS_VERIFICACION: Record<string, string> = {
  "no se encuentra en el censo": "No está en el censo",
  "vota en valledupar": "Valledupar",
};

/**
 * Lleva los textos del archivo a lo que esperan los formularios.
 * "-" o vacío en cualquier celda = sin dato. La cédula usa la regla única
 * (limpiarCedula). Devuelve el problema (no se importa) y el aviso (se importa marcada).
 */
export function prepararCampos(datos: Partial<Record<Campo, string>>): {
  datos: Partial<Record<Campo, string>>;
  problema: string | null;
  aviso: string | null;
} {
  const d = { ...datos };
  for (const c of Object.keys(d) as Campo[]) {
    if (d[c] && VACIOS.has(normalizar(d[c]!))) delete d[c];
  }
  let aviso: string | null = null;
  if (d.cedula) {
    const ced = limpiarCedula(d.cedula);
    if (ced.error) return { datos: d, problema: `${ced.error} ("${d.cedula}")`, aviso: null };
    d.cedula = ced.cedula!;
    aviso = ced.aviso;
  }
  if (d.mesa && /^\d+(\.0+)?$/.test(d.mesa)) d.mesa = String(parseInt(d.mesa, 10));
  if (d.municipio_verificacion) {
    const n = normalizar(d.municipio_verificacion);
    const valor = SINONIMOS_VERIFICACION[n] ?? VERIFICACIONES.find((v) => normalizar(v) === n);
    if (!valor) return { datos: d, problema: `Verificación no reconocida: "${d.municipio_verificacion}".`, aviso };
    d.municipio_verificacion = valor;
  }
  return { datos: d, problema: null, aviso };
}

export function aFormData(datos: Partial<Record<Campo, string>>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) if (v) fd.set(k, v);
  // Barrios, municipios y puestos que no estén en la lista se agregan como nuevos.
  for (const cat of ["barrio", "municipio", "puesto_votacion"] as Catalogo[]) fd.set(cat + SUFIJO_NUEVO, "1");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

export type FilaValida =
  | { fila: number; tipo: "persona"; registro: FilaPersona; coordinador: string | null; referente: string | null; nuevos: { cat: Catalogo; nombre: string }[] }
  | { fila: number; tipo: TipoReferente; registro: FilaReferente; nuevos: { cat: Catalogo; nombre: string }[] };

export type Problema = { fila: number; nombre: string; motivo: string };

/** Valida cada fila con las reglas de los formularios. */
export function validarFilas(
  filas: FilaMapeada[],
  tipo: TipoImportacion,
  catalogos: Catalogos,
  opciones: { todasAutorizaron?: boolean; ahora?: () => Date } = {},
): { validas: FilaValida[]; problemas: Problema[]; avisos: Problema[] } {
  const validas: FilaValida[] = [];
  const problemas: Problema[] = [];
  const avisos: Problema[] = [];
  for (const f of filas) {
    const nombre = f.datos.nombre ?? "(sin nombre)";
    const { datos, problema, aviso } = prepararCampos(f.datos);
    if (problema) {
      problemas.push({ fila: f.fila, nombre, motivo: problema });
      continue;
    }
    if (aviso) avisos.push({ fila: f.fila, nombre, motivo: aviso });
    if (tipo === "persona") {
      const extra: Record<string, string> = opciones.todasAutorizaron ? { autorizacion_datos: "on" } : {};
      const r = leerPersona(aFormData(datos, extra), true, catalogos, opciones.ahora);
      const errores = Object.values(r.errores);
      if (errores.length) {
        problemas.push({ fila: f.fila, nombre, motivo: errores.join(" ") });
        continue;
      }
      const coordinador = datos.coordinador?.trim() || null;
      validas.push({ fila: f.fila, tipo, registro: r.fila, coordinador, referente: f.referente ?? null, nuevos: r.nuevos });
    } else {
      const r = leerReferente(aFormData(datos), tipo, catalogos);
      const errores = Object.values(r.errores);
      if (errores.length) {
        problemas.push({ fila: f.fila, nombre, motivo: errores.join(" ") });
        continue;
      }
      validas.push({ fila: f.fila, tipo, registro: r.fila, nuevos: r.nuevos });
    }
  }
  return { validas, problemas, avisos };
}

// ---------------------------------------------------------------------------
// 3. Ya existentes y repetidos
// ---------------------------------------------------------------------------

export type Existentes = {
  personas: { id: string; nombre: string; cedula: string | null }[];
  referentes: { id: string; nombre: string; cedula: string | null; tipo: TipoReferente }[];
};

export type Omitida = { fila: number; nombre: string; motivo: string };

export type Clasificacion = {
  nuevos: (FilaValida & { referenteId?: string | null })[];
  existentes: Omitida[];
  problemas: Problema[];
};

const ETIQUETA: Record<TipoReferente, string> = { lider: "líder", empresario: "empresario", aliado: "aliado" };

/**
 * Separa nuevos de los que ya existen.
 * - Por cédula; si la fila no tiene cédula, por nombre normalizado.
 * - Nadie puede ser persona y referente a la vez: se busca en las dos tablas.
 * - Repetidos dentro del mismo archivo: el segundo queda con problema.
 * - Personas: el referente al que vincular debe existir (por id o por nombre).
 */
export function clasificar(validas: FilaValida[], existentes: Existentes, problemasPrevios: Problema[] = []): Clasificacion {
  const porCedula = new Map<string, string>();
  const porNombre = new Map<string, string>();
  for (const p of existentes.personas) {
    if (p.cedula) porCedula.set(p.cedula, `ya existe como persona (${p.nombre})`);
    porNombre.set(normalizar(p.nombre), `ya existe como persona (${p.nombre})`);
  }
  for (const r of existentes.referentes) {
    const t = `ya existe como ${ETIQUETA[r.tipo]} (${r.nombre})`;
    if (r.cedula) porCedula.set(r.cedula, t);
    porNombre.set(normalizar(r.nombre), t);
  }

  // Referentes a los que se puede vincular: por id o por nombre (si el nombre es único).
  const refPorId = new Map(existentes.referentes.map((r) => [r.id, r.id]));
  const refPorNombre = new Map<string, string | null>();
  for (const r of existentes.referentes) {
    const k = normalizar(r.nombre);
    refPorNombre.set(k, refPorNombre.has(k) ? null : r.id); // null = nombre repetido, ambiguo
  }

  const enArchivoCedula = new Map<string, number>();
  const enArchivoNombre = new Map<string, number>();
  const res: Clasificacion = { nuevos: [], existentes: [], problemas: [...problemasPrevios] };

  for (const v of validas) {
    const nombre = String(v.registro.nombre ?? "");
    const cedula = (v.registro.cedula as string | null) ?? null;
    const kNombre = normalizar(nombre);

    const ya = cedula ? porCedula.get(cedula) : porNombre.get(kNombre);
    if (ya) {
      res.existentes.push({ fila: v.fila, nombre, motivo: ya });
      continue;
    }
    const previa = cedula ? enArchivoCedula.get(cedula) : enArchivoNombre.get(kNombre);
    if (previa !== undefined) {
      res.problemas.push({
        fila: v.fila,
        nombre,
        motivo: cedula ? `Cédula repetida en el archivo (fila ${previa}).` : `Nombre repetido en el archivo sin cédula (fila ${previa}).`,
      });
      continue;
    }

    let referenteId: string | null = null;
    if (v.tipo === "persona" && v.referente) {
      const k = v.referente.trim();
      referenteId = refPorId.get(k) ?? refPorNombre.get(normalizar(k)) ?? null;
      if (!referenteId) {
        const ambiguo = refPorNombre.get(normalizar(k)) === null;
        res.problemas.push({
          fila: v.fila,
          nombre,
          motivo: ambiguo ? `Hay varios referentes llamados "${k}".` : `No existe el referente "${k}".`,
        });
        continue;
      }
    }

    if (cedula) enArchivoCedula.set(cedula, v.fila);
    else enArchivoNombre.set(kNombre, v.fila);
    res.nuevos.push({ ...v, referenteId });
  }
  res.problemas.sort((a, b) => a.fila - b.fila);
  return res;
}

/** Resumen corto para el asistente: conteos y como máximo 30 filas con problemas. */
export function resumenParaAsistente(c: Clasificacion, maxProblemas = 30) {
  return {
    nuevos: c.nuevos.length,
    ya_existentes: c.existentes.length,
    con_problemas: c.problemas.length,
    problemas: c.problemas.slice(0, maxProblemas).map((p) => ({ fila: p.fila, motivo: p.motivo })),
  };
}
