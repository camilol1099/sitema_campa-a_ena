import type { Catalogo, Catalogos } from "./catalogos";
import type { TipoReferente } from "./ejes";
import { esSinLider, NOMBRE_SIN_LIDER } from "./sin-lider";
import { leerPersona, leerReferente, type FilaPersona, type FilaReferente } from "./formularios";
import {
  aFormData,
  clasificar,
  cumple,
  normalizar,
  prepararCampos,
  textoCelda,
  validarFilas,
  type Campo,
  type Condicion,
  type FilaArchivo,
  type FilaMapeada,
  type TipoImportacion,
} from "./importacion";

// Formato de Excel de la campaña (ver docs/FORMATO_EXCEL.md). Todo en código,
// sin el modelo y sin red: las Server Actions cargan la base y llaman aquí.

// ---------------------------------------------------------------------------
// 1. Reconocer el formato
// ---------------------------------------------------------------------------
export type CampoCampana =
  | "numero" | "nombre" | "cedula" | "celular" | "direccion" | "barrio"
  | "puesto_votacion" | "mesa" | "municipio_verificacion" | "lider" | "coordinador";

const ENCABEZADOS: Record<string, CampoCampana> = {
  "#": "numero",
  nombre: "nombre",
  cedula: "cedula",
  celular: "celular",
  direccion: "direccion",
  barrio: "barrio",
  "puesto de votacion": "puesto_votacion",
  mesa: "mesa",
  municipio: "municipio_verificacion",
  lider: "lider",
  coordinador: "coordinador",
};
const OBLIGATORIOS: CampoCampana[] = ["nombre", "cedula", "lider"];

/** Encabezado comparable: sin tildes, minúsculas, sin signos ni espacios de más. */
export const claveEncabezado = (e: string) =>
  normalizar(e).replace(/[^a-z0-9# ]/g, " ").replace(/\s+/g, " ").trim();

/** Si la hoja tiene el formato de la campaña, devuelve campo → encabezado. Si no, null. */
export function detectarFormatoCampana(encabezados: string[]): Partial<Record<CampoCampana, string>> | null {
  const columnas: Partial<Record<CampoCampana, string>> = {};
  for (const e of encabezados) {
    const campo = ENCABEZADOS[claveEncabezado(e)];
    if (campo && !columnas[campo]) columnas[campo] = e;
  }
  return OBLIGATORIOS.every((c) => columnas[c]) ? columnas : null;
}

// ---------------------------------------------------------------------------
// 2. Filas del archivo → filas mapeadas (el líder va en `referente`)
// ---------------------------------------------------------------------------
const CAMPOS_FILA: CampoCampana[] = [
  "nombre", "cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa", "municipio_verificacion", "coordinador",
];

export function filasCampana(
  filas: FilaArchivo[],
  columnas: Partial<Record<CampoCampana, string>>,
  primeraFila = 1,
  condiciones: Condicion[] = [],
): FilaMapeada[] {
  const salida: FilaMapeada[] = [];
  filas.forEach((f, i) => {
    if (Object.values(f).every((v) => textoCelda(v) === "")) return;
    if (!condiciones.every((c) => cumple(f, c))) return;
    const datos: Partial<Record<Campo, string>> = {};
    for (const campo of CAMPOS_FILA) {
      const col = columnas[campo];
      const t = col ? textoCelda(f[col]) : "";
      if (t) datos[campo as Campo] = t;
    }
    const lider = columnas.lider ? textoCelda(f[columnas.lider]) : "";
    salida.push({ fila: primeraFila + i, datos, referente: lider && lider !== "-" ? lider : null });
  });
  return salida;
}

// ---------------------------------------------------------------------------
// 3. Análisis
// ---------------------------------------------------------------------------
export type Alcance = "todo" | "solo_lideres" | "solo_lideres_nuevos" | "solo_personas";
export const ALCANCES: Alcance[] = ["todo", "solo_lideres", "solo_lideres_nuevos", "solo_personas"];
export type FiltroCampana = { alcance: Alcance; lideres?: string[]; condiciones?: Condicion[] };

export type ReferenteExistente = {
  id: string;
  tipo: TipoReferente;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  barrio: string | null;
  puesto_votacion: string | null;
  mesa: number | null;
  municipio_verificacion: string | null;
  coordinador: string | null;
};
export type PersonaExistente = { id: string; nombre: string; cedula: string | null; referentes: { id: string; nombre: string }[] };
export type ExistentesCampana = { personas: PersonaExistente[]; referentes: ReferenteExistente[] };

export type Resolucion = "mismo" | "otro";
export type OpcionesCampana = {
  filtro?: FiltroCampana;
  /** Respuesta de la usuaria a "posible mismo líder", por clave del líder del archivo. */
  resoluciones?: Record<string, Resolucion>;
  todasAutorizaron?: boolean;
  ahora?: () => Date;
};

type Nuevo = { cat: Catalogo; nombre: string };
export type FilaPlan = { fila: number | null; nombre: string; detalle: string };
export type LiderNuevo = { clave: string; fila: number | null; registro: FilaReferente; nuevos: Nuevo[]; personas: number };
export type LiderCompletar = { id: string; nombre: string; fila: number; campos: Record<string, string | number>; nuevos: Nuevo[] };
export type PersonaNueva = {
  fila: number;
  registro: FilaPersona;
  nuevos: Nuevo[];
  /** id de un referente existente, o clave de un líder nuevo del archivo, o sin vínculo */
  lider: { id: string } | { clave: string } | null;
  liderNombre: string | null;
  coordinador: string | null;
};
export type Duda = { clave: string; nombre: string; candidato: { id: string; nombre: string }; filas: number };
export type Plan = {
  lideresNuevos: LiderNuevo[];
  lideresCompletar: LiderCompletar[];
  personasNuevas: PersonaNueva[];
  existentes: FilaPlan[];
  avisos: FilaPlan[];
  problemas: FilaPlan[];
  dudas: Duda[];
  /** Personas sin líder: se vinculan a "Sin líder asignado" (lib/sin-lider.ts). */
  sinLider: number;
};

// Campos que se completan en un líder existente (solo si están vacíos).
export const COMPLETABLES = [
  "cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa", "municipio_verificacion", "coordinador",
] as const;
const ETIQUETAS: Record<string, string> = {
  cedula: "cédula", celular: "celular", direccion: "dirección", barrio: "barrio",
  puesto_votacion: "puesto", mesa: "mesa", municipio_verificacion: "verificación", coordinador: "coordinador",
};
const CAT_DE_CAMPO: Partial<Record<string, Catalogo>> = { barrio: "barrio", puesto_votacion: "puesto_votacion" };

// "Pedro Molina" ~ "Pedro Molinas": misma primera palabra y la segunda igual o con una letra de diferencia.
function distancia(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}
export function parecidos(a: string, b: string): boolean {
  if (a === b) return false;
  const pa = a.split(" ").filter((w) => /[a-z]/.test(w));
  const pb = b.split(" ").filter((w) => /[a-z]/.test(w));
  if (pa.length < 2 || pb.length < 2 || pa[0] !== pb[0]) return false;
  return distancia(pa[1]!, pb[1]!) <= 1;
}

const vacio = (v: unknown) => v === null || v === undefined || v === "";

type FilaPrep = {
  fila: number;
  nombre: string;
  clave: string;
  datos: Partial<Record<Campo, string>>;
  problema: string | null;
  aviso: string | null;
};

type Grupo = {
  clave: string;
  grafias: Map<string, number>;
  propia: FilaPrep | null; // fila del líder
  filas: FilaPrep[]; // personas
  copias: FilaPrep[]; // fila del líder repetida
};

type Estado =
  | { tipo: "nuevo" }
  | { tipo: "existe"; ref: ReferenteExistente }
  | { tipo: "no_coincide"; ref: ReferenteExistente } // existe con otra cédula: no se toca
  | { tipo: "duda"; candidato: ReferenteExistente }
  | { tipo: "ambiguo" }; // varios referentes con ese nombre

function nombreLider(g: Grupo) {
  // La grafía más usada, prefiriendo la que no está toda en minúscula.
  return [...g.grafias.entries()].sort((a, b) => Number(a[0] === a[0].toLowerCase()) - Number(b[0] === b[0].toLowerCase()) || b[1] - a[1])[0]![0];
}

/** Analiza las filas del formato campaña y arma el plan de importación. */
export function analizarCampana(
  filas: FilaMapeada[],
  existentes: ExistentesCampana,
  catalogos: Catalogos,
  opciones: OpcionesCampana = {},
): Plan {
  const plan: Plan = {
    lideresNuevos: [], lideresCompletar: [], personasNuevas: [],
    existentes: [], avisos: [], problemas: [], dudas: [], sinLider: 0,
  };
  const alcance = opciones.filtro?.alcance ?? "todo";
  const soloDe = opciones.filtro?.lideres?.length ? new Set(opciones.filtro.lideres.map(normalizar)) : null;
  const conPersonas = alcance === "todo" || alcance === "solo_personas";
  const conLideresNuevos = alcance !== "solo_personas";
  const conCompletar = alcance === "todo" || alcance === "solo_lideres";

  // --- preparar filas y agrupar por líder ---
  const grupos = new Map<string, Grupo>();
  const sinLider: FilaPrep[] = [];
  for (const f of filas) {
    const nombre = (f.datos.nombre ?? "").trim();
    const prep = prepararCampos(f.datos);
    const p: FilaPrep = {
      fila: f.fila,
      nombre: nombre || "(sin nombre)",
      clave: normalizar(nombre),
      datos: prep.datos,
      problema: nombre ? prep.problema : "Fila sin nombre.",
      aviso: prep.aviso,
    };
    const lider = (f.referente ?? "").trim();
    if (!lider) {
      sinLider.push(p);
      continue;
    }
    const clave = normalizar(lider);
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, grafias: new Map(), propia: null, filas: [], copias: [] };
      grupos.set(clave, g);
    }
    g.grafias.set(lider, (g.grafias.get(lider) ?? 0) + 1);
    if (p.clave === clave) {
      if (g.propia) g.copias.push(p);
      else g.propia = p;
    } else g.filas.push(p);
  }
  if (soloDe) sinLider.length = 0; // filtrar por líder excluye a los que no tienen
  // Todos los líderes del archivo se conocen (para "una persona no puede ser líder");
  // el filtro por líder solo decide cuáles se importan.
  const elegido = (g: Grupo) => !soloDe || soloDe.has(g.clave);

  // --- índices de la base ---
  const refPorCedula = new Map(existentes.referentes.filter((r) => r.cedula).map((r) => [r.cedula!, r]));
  const refPorNombre = new Map<string, ReferenteExistente[]>();
  for (const r of existentes.referentes) {
    const k = normalizar(r.nombre);
    refPorNombre.set(k, [...(refPorNombre.get(k) ?? []), r]);
  }
  const perPorCedula = new Map(existentes.personas.filter((p) => p.cedula).map((p) => [p.cedula!, p]));
  const perPorNombre = new Map<string, PersonaExistente[]>();
  for (const p of existentes.personas) {
    const k = normalizar(p.nombre);
    perPorNombre.set(k, [...(perPorNombre.get(k) ?? []), p]);
  }

  // Quién es líder (para "una persona no puede ser líder"): clave → nombre visible.
  const lideresPorNombre = new Map<string, string>();
  const lideresPorCedula = new Map<string, { clave: string; nombre: string }>();
  for (const r of existentes.referentes) {
    lideresPorNombre.set(normalizar(r.nombre), r.nombre);
    if (r.cedula) lideresPorCedula.set(r.cedula, { clave: normalizar(r.nombre), nombre: r.nombre });
  }

  // --- resolver cada líder del archivo ---
  const estados = new Map<string, Estado>();
  const cedulaLider = new Map<string, string | null>(); // cédula válida de la fila del líder
  const cedulasDeLideres = new Map<string, string>(); // para cédulas repetidas entre líderes del archivo
  for (const g of grupos.values()) {
    const nombre = nombreLider(g);
    lideresPorNombre.set(g.clave, nombre);
    // Lo que se anota en el plan solo para los líderes elegidos.
    const anotar: Pick<Plan, "existentes" | "problemas" | "avisos"> = elegido(g) ? plan : { existentes: [], problemas: [], avisos: [] };
    for (const c of g.copias) anotar.existentes.push({ fila: c.fila, nombre: c.nombre, detalle: "Fila del líder repetida" });

    let ced: string | null = null;
    if (g.propia?.problema) {
      anotar.problemas.push({ fila: g.propia.fila, nombre: g.propia.nombre, detalle: `Fila del líder: ${g.propia.problema}` });
    } else if (g.propia?.datos.cedula) {
      ced = g.propia.datos.cedula;
      const otro = cedulasDeLideres.get(ced);
      if (otro && otro !== g.clave) {
        anotar.problemas.push({ fila: g.propia.fila, nombre: g.propia.nombre, detalle: `Cédula repetida en el archivo (líder ${lideresPorNombre.get(otro)})` });
        ced = null;
      } else cedulasDeLideres.set(ced, g.clave);
      if (g.propia.aviso) anotar.avisos.push({ fila: g.propia.fila, nombre: g.propia.nombre, detalle: g.propia.aviso });
    }
    cedulaLider.set(g.clave, ced);
    if (ced) lideresPorCedula.set(ced, { clave: g.clave, nombre });

    // (a) por cédula de su fila, (b) por nombre normalizado exacto
    const porCed = ced ? refPorCedula.get(ced) : undefined;
    const porNombre = refPorNombre.get(g.clave) ?? [];
    let estado: Estado;
    if (porCed) estado = { tipo: "existe", ref: porCed };
    else if (porNombre.length > 1) estado = { tipo: "ambiguo" };
    else if (porNombre.length === 1) {
      const ref = porNombre[0]!;
      estado = ced && ref.cedula && ref.cedula !== ced ? { tipo: "no_coincide", ref } : { tipo: "existe", ref };
    } else {
      const candidato = existentes.referentes.find((r) => parecidos(g.clave, normalizar(r.nombre)));
      const res = opciones.resoluciones?.[g.clave];
      if (candidato && res === "mismo") {
        estado = ced && candidato.cedula && candidato.cedula !== ced ? { tipo: "no_coincide", ref: candidato } : { tipo: "existe", ref: candidato };
      } else if (candidato && res !== "otro") estado = { tipo: "duda", candidato };
      else estado = { tipo: "nuevo" };
    }
    estados.set(g.clave, estado);
  }

  // Datos de la fila del líder, validados con las reglas del formulario de referente.
  const datosLider = (g: Grupo, nombre: string, ced: string | null) => {
    const datos: Partial<Record<Campo, string>> = { ...(g.propia && !g.propia.problema ? g.propia.datos : {}), nombre };
    if (ced) datos.cedula = ced;
    else delete datos.cedula;
    const r = leerReferente(aFormData(datos), "lider", catalogos);
    if (Object.keys(r.errores).length) {
      plan.problemas.push({ fila: g.propia?.fila ?? null, nombre, detalle: `Datos del líder: ${Object.values(r.errores).join(" ")} Se usa solo el nombre.` });
      const solo = leerReferente(aFormData({ nombre }), "lider", catalogos);
      return { fila: solo.fila, nuevos: solo.nuevos };
    }
    return { fila: r.fila, nuevos: r.nuevos };
  };

  for (const g of grupos.values()) {
    if (!elegido(g)) continue;
    const nombre = lideresPorNombre.get(g.clave)!;
    const estado = estados.get(g.clave)!;
    let ced = cedulaLider.get(g.clave) ?? null;
    // La cédula del líder no puede ser de una persona registrada.
    if (ced && perPorCedula.has(ced)) {
      plan.problemas.push({ fila: g.propia?.fila ?? null, nombre, detalle: `La cédula del líder es de la persona ${perPorCedula.get(ced)!.nombre}; no se usa.` });
      ced = null;
    }

    if (estado.tipo === "nuevo" && conLideresNuevos) {
      const { fila, nuevos } = datosLider(g, nombre, ced);
      plan.lideresNuevos.push({ clave: g.clave, fila: g.propia?.fila ?? null, registro: fila, nuevos, personas: 0 });
    } else if (estado.tipo === "existe") {
      const campos: Record<string, string | number> = {};
      let nuevos: Nuevo[] = [];
      if (g.propia && !g.propia.problema && conCompletar) {
        const { fila, nuevos: n } = datosLider(g, nombre, ced && (!refPorCedula.has(ced) || refPorCedula.get(ced)!.id === estado.ref.id) ? ced : null);
        for (const c of COMPLETABLES) {
          if (vacio(estado.ref[c]) && !vacio(fila[c])) campos[c] = fila[c] as string | number;
        }
        nuevos = n.filter((x) => Object.entries(CAT_DE_CAMPO).some(([campo, cat]) => cat === x.cat && campo in campos));
      }
      if (Object.keys(campos).length) {
        plan.lideresCompletar.push({ id: estado.ref.id, nombre: estado.ref.nombre, fila: g.propia!.fila, campos, nuevos });
      } else if (g.propia && !g.propia.problema && alcance !== "solo_personas") {
        plan.existentes.push({ fila: g.propia.fila, nombre: g.propia.nombre, detalle: `Líder ya registrado (${estado.ref.nombre})` });
      }
    } else if (estado.tipo === "no_coincide") {
      plan.problemas.push({
        fila: g.propia?.fila ?? null,
        nombre,
        detalle: `Cédula del líder no coincide: en la base ${estado.ref.cedula}, en el archivo ${cedulaLider.get(g.clave)}. El líder no se toca.`,
      });
    } else if (estado.tipo === "duda") {
      plan.dudas.push({ clave: g.clave, nombre, candidato: { id: estado.candidato.id, nombre: estado.candidato.nombre }, filas: g.filas.length + (g.propia ? 1 : 0) });
    } else if (estado.tipo === "ambiguo") {
      plan.problemas.push({ fila: g.propia?.fila ?? null, nombre, detalle: "Hay varios referentes con este nombre en la base; no se sabe cuál es." });
    }
  }

  // --- personas ---
  const cedulasVistas = new Map<string, number>(); // cédula → fila donde apareció primero
  for (const g of grupos.values()) {
    const ced = cedulaLider.get(g.clave);
    if (ced && g.propia) cedulasVistas.set(ced, g.propia.fila);
  }
  const sinCedulaVistas = new Set<string>();
  const nuevoPorClave = new Map(plan.lideresNuevos.map((l) => [l.clave, l]));

  const procesarPersona = (p: FilaPrep, g: Grupo | null) => {
    const liderNombre = g ? lideresPorNombre.get(g.clave)! : null;
    if (p.problema) return void plan.problemas.push({ fila: p.fila, nombre: p.nombre, detalle: p.problema });
    const ced = p.datos.cedula ?? null;

    // Una persona no puede ser líder.
    const liderCed = ced ? lideresPorCedula.get(ced) : undefined;
    // Misma cédula que su propio líder (con el nombre escrito distinto): es el líder, no una persona.
    if (liderCed && g && liderCed.clave === g.clave) {
      return void plan.existentes.push({ fila: p.fila, nombre: p.nombre, detalle: `Es el mismo líder (misma cédula que ${liderNombre})` });
    }
    const esLider = (liderCed && liderCed.clave !== g?.clave) || (lideresPorNombre.has(p.clave) && p.clave !== g?.clave);
    if (esLider) {
      return void plan.avisos.push({ fila: p.fila, nombre: p.nombre, detalle: `Es líder; aparece bajo ${liderNombre ?? "ningún líder"}. No se crea como persona.` });
    }

    if (ced) {
      const previa = cedulasVistas.get(ced);
      if (previa !== undefined) {
        return void plan.problemas.push({ fila: p.fila, nombre: p.nombre, detalle: `Cédula repetida en el archivo (fila ${previa})` });
      }
      cedulasVistas.set(ced, p.fila);
    }

    // Líder resuelto
    const estado = g ? estados.get(g.clave)! : null;
    const refId = estado && (estado.tipo === "existe" || estado.tipo === "no_coincide") ? estado.ref.id : null;
    if (estado?.tipo === "duda") return; // espera la respuesta de la usuaria (se cuenta en la duda)
    if (estado?.tipo === "ambiguo") {
      return void plan.avisos.push({ fila: p.fila, nombre: p.nombre, detalle: `No se importa: hay varios líderes llamados ${liderNombre}.` });
    }
    if (estado?.tipo === "nuevo" && !nuevoPorClave.has(g!.clave)) {
      return void plan.avisos.push({ fila: p.fila, nombre: p.nombre, detalle: `Su líder ${liderNombre} no está registrado.` });
    }

    // ¿Ya existe?
    if (ced && perPorCedula.has(ced)) {
      const ex = perPorCedula.get(ced)!;
      if (!g || (refId && ex.referentes.some((r) => r.id === refId))) {
        return void plan.existentes.push({ fila: p.fila, nombre: p.nombre, detalle: `Ya existe (${ex.nombre})` });
      }
      const con = ex.referentes.map((r) => r.nombre).join(", ");
      return void plan.avisos.push({ fila: p.fila, nombre: p.nombre, detalle: con ? `Ya está con ${con}. Se omite.` : "Ya existe sin líder. Se omite." });
    }
    if (!ced) {
      const k = `${p.clave}|${g?.clave ?? ""}`;
      if (sinCedulaVistas.has(k)) return void plan.existentes.push({ fila: p.fila, nombre: p.nombre, detalle: "Fila repetida en el archivo" });
      sinCedulaVistas.add(k);
      const mismos = perPorNombre.get(p.clave) ?? [];
      if (mismos.some((x) => (refId ? x.referentes.some((r) => r.id === refId) : !g && x.referentes.every((r) => esSinLider(r.nombre))))) {
        return void plan.existentes.push({ fila: p.fila, nombre: p.nombre, detalle: "Ya existe (mismo nombre y líder, sin cédula)" });
      }
    }

    if (!g) {
      plan.sinLider++;
    }

    // Reglas del formulario de persona
    const extra: Record<string, string> = opciones.todasAutorizaron ? { autorizacion_datos: "on" } : {};
    const datos = { ...p.datos };
    delete datos.coordinador;
    const r = leerPersona(aFormData(datos, extra), true, catalogos, opciones.ahora);
    if (Object.keys(r.errores).length) {
      return void plan.problemas.push({ fila: p.fila, nombre: p.nombre, detalle: Object.values(r.errores).join(" ") });
    }
    if (p.aviso) plan.avisos.push({ fila: p.fila, nombre: p.nombre, detalle: `${p.aviso} Se importa.` });

    const lider = !g ? null : refId ? { id: refId } : { clave: g.clave };
    if (g && !refId) nuevoPorClave.get(g.clave)!.personas++;
    // Si el líder ya existe, se muestra su nombre en la base (no como viene en el archivo).
    const nombreVinculo = estado && "ref" in estado ? estado.ref.nombre : liderNombre;
    plan.personasNuevas.push({ fila: p.fila, registro: r.fila, nuevos: r.nuevos, lider, liderNombre: nombreVinculo, coordinador: p.datos.coordinador?.trim() || null });
  };

  if (conPersonas) {
    for (const g of grupos.values()) if (elegido(g)) for (const p of g.filas) procesarPersona(p, g);
    for (const p of sinLider) procesarPersona(p, null);
  }
  vincularSinLider(plan, existentes, catalogos);

  const porFila = (a: FilaPlan, b: FilaPlan) => (a.fila ?? 0) - (b.fila ?? 0);
  plan.problemas.sort(porFila);
  plan.avisos.sort(porFila);
  plan.existentes.sort(porFila);
  return plan;
}

// ---------------------------------------------------------------------------
// 4. Para mostrar y para el modelo
// ---------------------------------------------------------------------------
export const etiquetaCampos = (campos: Record<string, unknown>) =>
  Object.keys(campos).map((c) => ETIQUETAS[c] ?? c).join(", ");

/** Lo único que recibe el modelo después de la vista previa: conteos y máximo 10 ejemplos. */
export function resumenPlan(plan: Plan, max = 10) {
  const ejemplos = [
    ...plan.problemas.map((p) => ({ tipo: "problema", fila: p.fila, motivo: p.detalle })),
    ...plan.avisos.map((a) => ({ tipo: "aviso", fila: a.fila, motivo: a.detalle })),
  ].slice(0, max);
  return {
    lideres_nuevos: plan.lideresNuevos.length,
    lideres_a_completar: plan.lideresCompletar.length,
    personas_nuevas: plan.personasNuevas.length,
    ya_existen: plan.existentes.length,
    avisos: plan.avisos.length,
    problemas: plan.problemas.length,
    posibles_mismos_lideres: plan.dudas.length,
    ejemplos,
  };
}

// ---------------------------------------------------------------------------
// 5. Entrada única para la vista previa y la importación
// ---------------------------------------------------------------------------
/**
 * Lo que manda el navegador. `campana`: formato reconocido en código.
 * `mapeo`: otro formato, con el mapeo que propuso el modelo.
 * El servidor vuelve a analizar todo; no confía en nada de esto.
 */
export type EntradaImportacion =
  | {
      modo: "campana";
      filas: FilaMapeada[];
      filtro: FiltroCampana;
      resoluciones: Record<string, Resolucion>;
      todasAutorizaron: boolean;
    }
  | { modo: "mapeo"; tipo: TipoImportacion; filas: FilaMapeada[]; todasAutorizaron: boolean };

/** Otro formato (mapeo del modelo) → el mismo plan, para una sola vista previa e importación. */
export function planDesdeMapeo(
  tipo: TipoImportacion,
  filas: FilaMapeada[],
  existentes: ExistentesCampana,
  catalogos: Catalogos,
  opciones: { todasAutorizaron?: boolean; ahora?: () => Date } = {},
): Plan {
  const { validas, problemas, avisos } = validarFilas(filas, tipo, catalogos, opciones);
  const c = clasificar(
    validas,
    { personas: existentes.personas, referentes: existentes.referentes },
    problemas,
  );
  const nombreRef = new Map(existentes.referentes.map((r) => [r.id, r.nombre]));
  const plan: Plan = {
    lideresNuevos: [], lideresCompletar: [], personasNuevas: [],
    existentes: c.existentes.map((e) => ({ fila: e.fila, nombre: e.nombre, detalle: e.motivo })),
    avisos: avisos.map((a) => ({ fila: a.fila, nombre: a.nombre, detalle: `${a.motivo} Se importa.` })),
    problemas: c.problemas.map((p) => ({ fila: p.fila, nombre: p.nombre, detalle: p.motivo })),
    dudas: [], sinLider: 0,
  };
  for (const n of c.nuevos) {
    if (n.tipo === "persona") {
      plan.personasNuevas.push({
        fila: n.fila,
        registro: n.registro,
        nuevos: n.nuevos,
        lider: n.referenteId ? { id: n.referenteId } : null,
        liderNombre: n.referenteId ? (nombreRef.get(n.referenteId) ?? null) : null,
        coordinador: n.coordinador,
      });
    } else {
      plan.lideresNuevos.push({ clave: normalizar(String(n.registro.nombre ?? "")), fila: n.fila, registro: n.registro, nuevos: n.nuevos, personas: 0 });
    }
  }
  plan.sinLider = plan.personasNuevas.filter((x) => !x.lider).length;
  vincularSinLider(plan, existentes, catalogos);
  return plan;
}

/**
 * Las personas sin líder quedan con el líder especial "Sin líder asignado"
 * (el que ya existe, o uno nuevo en este mismo lote). Así no se pierden y se
 * revisan en el panel de Revisión.
 */
function vincularSinLider(plan: Plan, existentes: ExistentesCampana, catalogos: Catalogos) {
  const sueltas = plan.personasNuevas.filter((p) => p.lider === null);
  if (!sueltas.length) return;
  const existente = existentes.referentes.find((r) => r.tipo === "lider" && esSinLider(r.nombre));
  let destino: { id: string } | { clave: string };
  let nombre = NOMBRE_SIN_LIDER;
  if (existente) {
    destino = { id: existente.id };
    nombre = existente.nombre;
  } else {
    const clave = normalizar(NOMBRE_SIN_LIDER);
    let nuevo = plan.lideresNuevos.find((l) => l.clave === clave);
    if (!nuevo) {
      const r = leerReferente(aFormData({ nombre: NOMBRE_SIN_LIDER }), "lider", catalogos);
      nuevo = { clave, fila: null, registro: r.fila, nuevos: r.nuevos, personas: 0 };
      plan.lideresNuevos.push(nuevo);
    }
    nuevo.personas += sueltas.length;
    destino = { clave };
  }
  for (const p of sueltas) {
    p.lider = destino;
    p.liderNombre = nombre;
  }
}
