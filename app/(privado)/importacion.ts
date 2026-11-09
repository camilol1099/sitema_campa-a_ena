"use server";

import { refresh } from "next/cache";
import {
  ALCANCES,
  analizarCampana,
  etiquetaCampos,
  planDesdeMapeo,
  resumenPlan,
  type Duda,
  type EntradaImportacion,
  type ExistentesCampana,
  type FilaPlan,
  type Plan,
  type ReferenteExistente,
} from "@/lib/campana";
import { catalogos } from "@/lib/datos";
import { nombreTipo, type TipoReferente } from "@/lib/ejes";
import { TIPOS_IMPORTACION, type FilaMapeada } from "@/lib/importacion";
import { crearClienteServidor } from "@/lib/supabase/server";

// Importación desde el asistente (sin IA). El navegador manda las filas ya
// mapeadas; aquí se vuelve a analizar todo contra la base: no se confía en lo
// que llega. Formato de la campaña: lib/campana.ts y docs/FORMATO_EXCEL.md.

const MAX_FILAS = 5000;

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Lo que ve la usuaria (sin datos de contacto) y el resumen para el modelo. */
export type Vista = {
  ok: boolean;
  mensaje?: string;
  /** "Líderes", o "Empresarios"/"Aliados" si se importan referentes de otro eje. */
  etiquetaReferentes: string;
  lideresNuevos: FilaPlan[];
  lideresCompletar: FilaPlan[];
  personasNuevas: FilaPlan[];
  existentes: FilaPlan[];
  avisos: FilaPlan[];
  problemas: FilaPlan[];
  dudas: Duda[];
  sinLider: number;
  /** Registros que se crean o completan al confirmar. */
  total: number;
  resumen?: ReturnType<typeof resumenPlan>;
};

const VACIA: Omit<Vista, "ok"> = {
  etiquetaReferentes: "Líderes",
  lideresNuevos: [], lideresCompletar: [], personasNuevas: [],
  existentes: [], avisos: [], problemas: [], dudas: [], sinLider: 0, total: 0,
};

// Lee una tabla completa por páginas (la API devuelve máximo 1000 filas por consulta).
// `soloActivos`: para vínculos, solo los vigentes.
async function todas<T>(supabase: Supabase, tabla: string, columnas: string, soloActivos = false): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const base = supabase.from(tabla).select(columnas);
    const q = soloActivos ? base.eq("activo", true) : base;
    const { data, error } = await q.order("id").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    salida.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return salida;
  }
}

async function cargarExistentes(supabase: Supabase): Promise<ExistentesCampana> {
  const [personas, referentes, vinculos] = await Promise.all([
    todas<{ id: string; nombre: string; cedula: string | null }>(supabase, "personas", "id,nombre,cedula"),
    todas<ReferenteExistente>(
      supabase,
      "referentes",
      "id,tipo,nombre,cedula,celular,direccion,barrio,puesto_votacion,mesa,municipio_verificacion,coordinador",
    ),
    todas<{ persona_id: string; referente_id: string }>(supabase, "vinculos", "id,persona_id,referente_id", true),
  ]);
  const nombre = new Map(referentes.map((r) => [r.id, r.nombre]));
  const porPersona = new Map<string, { id: string; nombre: string }[]>();
  for (const v of vinculos) {
    porPersona.set(v.persona_id, [...(porPersona.get(v.persona_id) ?? []), { id: v.referente_id, nombre: nombre.get(v.referente_id) ?? "" }]);
  }
  return { referentes, personas: personas.map((p) => ({ ...p, referentes: porPersona.get(p.id) ?? [] })) };
}

// ---------- revisar lo que llega del navegador ----------
const esTexto = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

function filasValidas(filas: unknown): filas is FilaMapeada[] {
  return (
    Array.isArray(filas) &&
    filas.length <= MAX_FILAS &&
    filas.every(
      (f) =>
        f && typeof f === "object" &&
        Number.isInteger((f as FilaMapeada).fila) &&
        (f as FilaMapeada).datos && typeof (f as FilaMapeada).datos === "object" &&
        Object.values((f as FilaMapeada).datos).every((v) => esTexto(v, 300)) &&
        ((f as FilaMapeada).referente == null || esTexto((f as FilaMapeada).referente, 200)),
    )
  );
}

function entradaValida(e: unknown): e is EntradaImportacion {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  if (!filasValidas(x.filas) || typeof x.todasAutorizaron !== "boolean") return false;
  if (x.modo === "mapeo") return TIPOS_IMPORTACION.includes(x.tipo as never);
  if (x.modo !== "campana") return false;
  const filtro = x.filtro as Record<string, unknown> | null;
  if (!filtro || !ALCANCES.includes(filtro.alcance as never)) return false;
  if (filtro.lideres !== undefined && !(Array.isArray(filtro.lideres) && filtro.lideres.length <= 50 && filtro.lideres.every((l) => esTexto(l, 200)))) return false;
  const res = x.resoluciones;
  if (!res || typeof res !== "object" || Object.keys(res).length > 500) return false;
  if (!Object.values(res).every((v) => v === "mismo" || v === "otro")) return false;
  return true;
}

async function planear(e: EntradaImportacion) {
  const supabase = await crearClienteServidor();
  const [cats, ya] = await Promise.all([catalogos(), cargarExistentes(supabase)]);
  const plan =
    e.modo === "campana"
      ? analizarCampana(e.filas, ya, cats, {
          filtro: { alcance: e.filtro.alcance, lideres: e.filtro.lideres },
          resoluciones: e.resoluciones,
          todasAutorizaron: e.todasAutorizaron,
        })
      : planDesdeMapeo(e.tipo, e.filas, ya, cats, { todasAutorizaron: e.todasAutorizaron });
  return { supabase, plan };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function vista(e: EntradaImportacion, plan: Plan): Vista {
  const tipoRef: TipoReferente = e.modo === "mapeo" && e.tipo !== "persona" ? e.tipo : "lider";
  return {
    ok: true,
    etiquetaReferentes: tipoRef === "lider" ? "Líderes" : `${nombreTipo(tipoRef)}s`,
    lideresNuevos: plan.lideresNuevos.map((l) => ({
      fila: l.fila,
      nombre: String(l.registro.nombre ?? ""),
      detalle: [l.fila ? "con los datos de su fila" : "solo el nombre", l.personas ? plural(l.personas, "persona", "personas") : ""].filter(Boolean).join(" · "),
    })),
    lideresCompletar: plan.lideresCompletar.map((l) => ({ fila: l.fila, nombre: l.nombre, detalle: `Agrega: ${etiquetaCampos(l.campos)}` })),
    personasNuevas: plan.personasNuevas.map((p) => ({
      fila: p.fila,
      nombre: String(p.registro.nombre ?? ""),
      detalle: p.liderNombre ? `Con ${p.liderNombre}` : "Sin líder",
    })),
    existentes: plan.existentes,
    avisos: plan.avisos,
    problemas: plan.problemas,
    dudas: plan.dudas,
    sinLider: plan.sinLider,
    total: plan.lideresNuevos.length + plan.lideresCompletar.length + plan.personasNuevas.length,
    resumen: resumenPlan(plan),
  };
}

export async function previsualizarImportacion(entrada: EntradaImportacion): Promise<Vista> {
  if (!entradaValida(entrada)) {
    return { ok: false, mensaje: `El archivo no se pudo revisar (máximo ${MAX_FILAS} filas).`, ...VACIA };
  }
  try {
    const { plan } = await planear(entrada);
    return vista(entrada, plan);
  } catch {
    return { ok: false, mensaje: "No se pudo revisar el archivo. Intente de nuevo.", ...VACIA };
  }
}

export type ResultadoImportacion = {
  ok: boolean;
  mensaje: string;
  loteId?: string;
  creados?: number;
  completados?: number;
};

export async function confirmarImportacion(archivo: string, entrada: EntradaImportacion): Promise<ResultadoImportacion> {
  const nombreArchivo = String(archivo ?? "").trim().slice(0, 200) || "archivo";
  if (!entradaValida(entrada)) return { ok: false, mensaje: "No se pudo importar el archivo." };

  try {
    // Se analiza de nuevo: la base pudo cambiar desde la vista previa.
    const { supabase, plan } = await planear(entrada);
    const total = plan.lideresNuevos.length + plan.lideresCompletar.length + plan.personasNuevas.length;
    if (total === 0) return { ok: false, mensaje: "No hay nada nuevo para importar." };

    const catalogo = { barrio: new Set<string>(), puesto_votacion: new Set<string>(), municipio: new Set<string>() };
    const agregarNuevos = (ns: { cat: keyof typeof catalogo; nombre: string }[]) => ns.forEach((n) => catalogo[n.cat].add(n.nombre));

    const idDeClave = new Map<string, string>();
    const referentes = plan.lideresNuevos.map((l) => {
      const id = crypto.randomUUID();
      idDeClave.set(l.clave, id);
      agregarNuevos(l.nuevos);
      return { id, ...l.registro };
    });
    const completar = plan.lideresCompletar.map((l) => {
      agregarNuevos(l.nuevos);
      return { id: l.id, campos: l.campos };
    });
    const personas: Record<string, unknown>[] = [];
    const vinculos: Record<string, unknown>[] = [];
    for (const p of plan.personasNuevas) {
      const id = crypto.randomUUID();
      agregarNuevos(p.nuevos);
      personas.push({ id, ...p.registro });
      const referenteId = !p.lider ? null : "id" in p.lider ? p.lider.id : idDeClave.get(p.lider.clave);
      if (referenteId) vinculos.push({ persona_id: id, referente_id: referenteId, coordinador: p.coordinador });
    }

    const { data, error } = await supabase.rpc("importar_lote", {
      p_archivo: nombreArchivo,
      p_tipo: entrada.modo === "campana" ? "campana" : entrada.tipo,
      p_barrios: [...catalogo.barrio],
      p_puestos: [...catalogo.puesto_votacion],
      p_municipios: [...catalogo.municipio],
      p_referentes: referentes,
      p_personas: personas,
      p_vinculos: vinculos,
      p_completar: completar,
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, mensaje: "Una de las cédulas ya está registrada (quizá alguien la guardó mientras tanto). No se guardó nada; revise la vista previa de nuevo." };
      }
      if (error.code === "23514") {
        return { ok: false, mensaje: "Hay una cédula o un dato no válido. No se guardó nada." };
      }
      return { ok: false, mensaje: "No se pudo importar. No se guardó nada." };
    }

    refresh();
    const partes = [
      referentes.length && plural(referentes.length, "líder nuevo", "líderes nuevos"),
      completar.length && plural(completar.length, "líder completado", "líderes completados"),
      personas.length && plural(personas.length, "persona", "personas"),
    ].filter(Boolean);
    return {
      ok: true,
      mensaje: `Se importaron ${partes.join(", ")}.`,
      loteId: String(data),
      creados: referentes.length + personas.length,
      completados: completar.length,
    };
  } catch {
    return { ok: false, mensaje: "No se pudo importar. No se guardó nada." };
  }
}

export type ResultadoDeshacer = {
  ok: boolean;
  mensaje: string;
  bloqueados?: { tipo: string; id: string; nombre: string; motivo: string }[];
};

export async function deshacerLote(loteId: string): Promise<ResultadoDeshacer> {
  if (!/^[0-9a-f-]{36}$/i.test(String(loteId))) return { ok: false, mensaje: "Lote no válido." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("deshacer_lote", { p_lote: loteId });
  if (error) return { ok: false, mensaje: "No se pudo deshacer el lote." };

  const r = data as {
    ya_deshecho?: boolean;
    personas_borradas?: number;
    referentes_borrados?: number;
    referentes_restaurados?: number;
    bloqueados?: ResultadoDeshacer["bloqueados"];
  };
  if (r.ya_deshecho) return { ok: true, mensaje: "Este lote ya se había deshecho." };

  refresh();
  const borrados = (r.personas_borradas ?? 0) + (r.referentes_borrados ?? 0);
  const restaurados = r.referentes_restaurados ?? 0;
  const bloqueados = r.bloqueados ?? [];
  const hecho = [`se borraron ${borrados} registros`, restaurados && `se devolvieron ${plural(restaurados, "líder", "líderes")} a como estaban`]
    .filter(Boolean)
    .join(" y ");
  return {
    ok: true,
    mensaje: bloqueados.length
      ? `${hecho[0]!.toUpperCase()}${hecho.slice(1)}. ${bloqueados.length} no se tocaron porque cambiaron después.`
      : `Se deshizo el lote: ${hecho}.`,
    bloqueados,
  };
}
