import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Catalogos } from "../catalogos";
import { EJES, esUuid, nombreTipo, type TipoReferente } from "../ejes";
import { leerPersona, leerReferente } from "../formularios";
import {
  aFormData,
  CAMPOS_PERSONA,
  CAMPOS_REFERENTE,
  normalizar,
  prepararCampos,
  revisarMapeo,
  TIPOS_IMPORTACION,
  type Campo,
  type Condicion,
  type Mapeo,
  type TipoImportacion,
} from "../importacion";
import type { crearClienteServidor } from "../supabase/server";
import type { Borrador, Evento } from "./tipos";
import { MAX_RESULTADOS } from "./config";
import { contarPorReferente, ordenarReferentes, pagina, type Orden } from "./conteos";
import { ALCANCES, detectarFormatoCampana, type Alcance } from "../campana";

// Herramientas del asistente. El modelo NO escribe SQL: cada herramienta es
// una función con consultas parametrizadas de supabase-js, con la sesión de
// la usuaria (RLS aplica) y máximo MAX_RESULTADOS filas.
// Las proponer_* no guardan nada: devuelven un borrador para la interfaz.

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

export type Contexto = {
  supabase: Supabase;
  catalogos: () => Promise<Catalogos>;
  /** Encabezados de cada hoja del archivo adjunto (los manda el navegador). */
  hojas: Record<string, string[]>;
};

export type Salida = { resultado: unknown; error?: boolean; evento?: Evento };

const TIPOS_REF = ["lider", "empresario", "aliado"] as const;
const PROBLEMAS = ["sin_cedula", "sin_puesto", "sin_verificar", "sin_lider", "varios_lideres"] as const;
// Problemas que se pueden contar por referente (los otros dos son sobre los vínculos mismos).
const PROBLEMAS_POR_REFERENTE = ["sin_cedula", "sin_puesto", "sin_verificar", "sin_barrio"] as const;

// ---------------------------------------------------------------------------
// Definiciones (lo que ve el modelo)
// ---------------------------------------------------------------------------
const texto = (description: string) => ({ type: "string", description });

const propsPersona = {
  nombre: texto("Nombre completo"),
  cedula: texto("Solo números"),
  celular: texto("Celular"),
  direccion: texto("Dirección"),
  barrio: texto("Barrio"),
  puesto_votacion: texto("Puesto de votación"),
  mesa: texto("Número de mesa"),
  municipio_verificacion: {
    type: "string",
    enum: ["Valledupar", "No vota en el municipio", "No está en el censo", "Errado", "Cancelado"],
  },
  observaciones: texto("Observaciones"),
};

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_personas",
    description:
      "Busca personas por nombre (sin importar tildes) o por cédula (completa o una parte), y referentes por nombre. Devuelve como máximo 8 personas (con cédula, celular, dirección, barrio y su primer referente) y 10 referentes. Para toda la información de una persona usa ver_persona.",
    input_schema: { type: "object", properties: { texto: texto("Nombre o cédula a buscar") }, required: ["texto"] },
  },
  {
    name: "ver_referente",
    description:
      "Ficha de un referente (líder, empresario o aliado) con el número de personas que tiene y la lista de sus personas (50 por llamada; si hay `siguiente`, pide la próxima con desde). Con con_contacto=true trae además cédula, celular y dirección de cada persona.",
    input_schema: {
      type: "object",
      properties: {
        referente: texto("Id del referente, o su nombre"),
        con_contacto: { type: "boolean", description: "true si la usuaria pide cédulas, celulares o direcciones de sus personas" },
        desde: { type: "integer", description: "Posición inicial en la lista de personas (0 = la primera)" },
      },
      required: ["referente"],
    },
  },
  {
    name: "ver_persona",
    description:
      "Toda la información de una persona: cédula, celular, dirección, barrio, puesto, mesa, verificación, observaciones, autorización de datos y sus referentes (con coordinador). Búscala antes con buscar_personas para tener su id.",
    input_schema: {
      type: "object",
      properties: { persona: texto("Id de la persona") },
      required: ["persona"],
    },
  },
  {
    name: "resumen_panel",
    description:
      "Cifras generales: referentes y personas por eje, calidad de datos (sin cédula, sin barrio, sin puesto, sin verificar, sin vínculo, con varios referentes), referentes con más y menos personas, y barrios con más personas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "lista_referentes",
    description:
      "Todos los referentes con cuántas personas tiene cada uno, de 50 en 50. Úsala para preguntas como \"¿cuántas personas tiene cada líder?\". Si la respuesta trae `siguiente`, hay más: vuelve a llamarla con desde = siguiente.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: [...TIPOS_REF], description: "Opcional: solo un eje (por defecto, líderes)" },
        orden: { type: "string", enum: ["mas", "menos", "nombre"], description: "mas = más personas primero (por defecto)" },
        desde: { type: "integer", description: "Posición inicial (0 = la primera)" },
      },
    },
  },
  {
    name: "problemas_por_referente",
    description:
      "Cuenta, por referente, cuántas de sus personas tienen un problema de datos (máximo 50 referentes, los que más tienen primero) y el total de personas afectadas. Úsala para \"agrupadas por líder\".",
    input_schema: {
      type: "object",
      properties: {
        problema: { type: "string", enum: [...PROBLEMAS_POR_REFERENTE] },
        tipo: { type: "string", enum: [...TIPOS_REF], description: "Opcional: solo un eje" },
      },
      required: ["problema"],
    },
  },
  {
    name: "personas_con_problemas",
    description:
      "Lista personas con un problema de datos (máximo 50) y cuántas hay en total. Se puede filtrar por un referente o por un barrio.",
    input_schema: {
      type: "object",
      properties: {
        problema: { type: "string", enum: [...PROBLEMAS], description: "sin_lider = sin ningún líder; varios_lideres = con 2 o más líderes" },
        referente: texto("Opcional: id o nombre del referente"),
        barrio: texto("Opcional: barrio"),
        con_contacto: { type: "boolean", description: "true si la usuaria pide cédulas, celulares o direcciones" },
      },
      required: ["problema"],
    },
  },
  {
    name: "proponer_persona",
    description:
      "Prepara un borrador para crear una persona o editar una existente (con id). NO guarda: la usuaria confirma o descarta en la tarjeta. Al editar, envía solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: texto("Solo para editar: id de la persona"),
        ...propsPersona,
        autorizacion_datos: { type: "boolean", description: "Si autorizó el tratamiento de datos (Ley 1581)" },
        referente: texto("Solo al crear: id o nombre del referente al que vincularla"),
        coordinador: texto("Solo al crear con referente: coordinador"),
      },
    },
  },
  {
    name: "proponer_referente",
    description:
      "Prepara un borrador para crear un referente (líder, empresario o aliado) o editar uno existente (con id). NO guarda: la usuaria confirma o descarta. Al editar, envía solo los campos que cambian.",
    input_schema: {
      type: "object",
      properties: {
        id: texto("Solo para editar: id del referente"),
        tipo: { type: "string", enum: [...TIPOS_REF] },
        ...propsPersona,
        municipio: texto("Municipio"),
        coordinador: texto("Su coordinador"),
        empresa: texto("Solo empresario"),
        zona_influencia: texto("Solo aliado"),
      },
    },
  },
  {
    name: "proponer_vinculo",
    description: "Prepara un borrador para vincular una persona a un referente. NO guarda: la usuaria confirma o descarta.",
    input_schema: {
      type: "object",
      properties: {
        persona: texto("Id de la persona (búscala antes con buscar_personas)"),
        referente: texto("Id o nombre del referente"),
        coordinador: texto("Opcional: coordinador"),
      },
      required: ["persona", "referente"],
    },
  },
  {
    name: "filtrar_importacion",
    description:
      "Importa una hoja con el formato de Excel de la campaña (ya reconocido en código: no hace falta mapear columnas). Solo indica la hoja y el filtro que pidió la usuaria; la interfaz arma la vista previa. Llámala siempre que pidan importar una hoja de ese formato, aunque no pidan filtro.",
    input_schema: {
      type: "object",
      properties: {
        hoja: texto("Nombre exacto de la hoja (obligatorio si hay varias con el formato)"),
        alcance: {
          type: "string",
          enum: [...ALCANCES],
          description: "todo (por defecto) · solo_lideres · solo_lideres_nuevos · solo_personas",
        },
        lideres: { type: "array", items: { type: "string" }, description: "Opcional: importar solo lo de estos líderes (nombres como en el archivo)" },
        condiciones: {
          type: "array",
          description: "Opcional: condiciones sobre columnas del archivo (todas deben cumplirse).",
          items: {
            type: "object",
            properties: {
              columna: texto("Nombre exacto de la columna"),
              operador: { type: "string", enum: ["igual", "distinto", "contiene", "vacio", "no_vacio"] },
              valor: texto("Valor a comparar"),
            },
            required: ["columna", "operador"],
          },
        },
      },
    },
  },
  {
    name: "proponer_mapeo",
    description:
      "Solo para archivos que NO tienen el formato de la campaña. Propone cómo importar el archivo adjunto: qué columna va en cada campo, el tipo de registro, a quién vincular las personas y un filtro opcional. La interfaz revisa todas las filas, sin IA, y muestra la vista previa; no se guarda nada sin confirmación.",
    input_schema: {
      type: "object",
      properties: {
        hoja: texto("Nombre exacto de la hoja"),
        tipo: { type: "string", enum: [...TIPOS_IMPORTACION], description: "Qué se crea con cada fila" },
        columnas: {
          type: "object",
          description:
            "Campo del sistema → nombre exacto de la columna. Personas: nombre, cedula, celular, direccion, barrio, puesto_votacion, mesa, municipio_verificacion, observaciones, coordinador. Referentes: nombre, cedula, celular, direccion, barrio, municipio, puesto_votacion, mesa, municipio_verificacion, coordinador, empresa (empresario), zona_influencia (aliado).",
          additionalProperties: { type: "string" },
        },
        vinculo: {
          type: "object",
          description: "Solo personas. modo 'columna' (columna con el nombre del referente) o 'fijo' (un referente para todas).",
          properties: {
            modo: { type: "string", enum: ["columna", "fijo"] },
            columna: texto("Si modo = columna"),
            referente: texto("Si modo = fijo: nombre o id del referente"),
          },
          required: ["modo"],
        },
        todas_autorizaron: { type: "boolean", description: "Solo si ella dijo que todas autorizaron el tratamiento de datos" },
        filtro: {
          type: "array",
          description: "Condiciones que deben cumplir las filas (todas).",
          items: {
            type: "object",
            properties: {
              columna: texto("Nombre exacto de la columna"),
              operador: { type: "string", enum: ["igual", "distinto", "contiene", "vacio", "no_vacio"] },
              valor: texto("Valor a comparar (sin importar tildes ni mayúsculas)"),
            },
            required: ["columna", "operador"],
          },
        },
      },
      required: ["hoja", "tipo", "columnas"],
    },
  },
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cadena = (v: unknown, max = 300): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const fallo = (mensaje: string): Salida => ({ resultado: { error: mensaje }, error: true });

const ETIQUETAS: Record<string, string> = {
  nombre: "Nombre", cedula: "Cédula", celular: "Celular", direccion: "Dirección", barrio: "Barrio",
  municipio: "Municipio", puesto_votacion: "Puesto", mesa: "Mesa", municipio_verificacion: "Verificación",
  observaciones: "Observaciones", coordinador: "Coordinador", empresa: "Empresa", zona_influencia: "Zona de influencia",
  autorizacion_datos: "Autorizó datos", fecha_autorizacion: "Fecha de autorización",
};
const mostrar = (k: string, v: string) => (k === "autorizacion_datos" ? (v === "on" ? "Sí" : "No") : v);

// Valores de la base → campos de formulario (texto).
function aDatos(fila: Record<string, unknown>, campos: readonly string[]): Record<string, string> {
  const d: Record<string, string> = {};
  for (const c of campos) {
    const v = fila[c];
    if (v === null || v === undefined || v === "") continue;
    d[c] = String(v);
  }
  return d;
}

// Lista para la tarjeta: al crear, todos los campos; al editar, solo lo que cambia.
function camposTarjeta(nuevo: Record<string, string>, antes: Record<string, string> | null): [string, string][] {
  const claves = new Set([...Object.keys(nuevo), ...Object.keys(antes ?? {})]);
  const lista: [string, string][] = [];
  for (const k of claves) {
    if (!ETIQUETAS[k]) continue;
    const a = antes?.[k] ?? "";
    const n = nuevo[k] ?? "";
    if (antes === null) {
      if (n) lista.push([ETIQUETAS[k], mostrar(k, n)]);
    } else if (a !== n) {
      lista.push([ETIQUETAS[k], `${a ? mostrar(k, a) : "(vacío)"} → ${n ? mostrar(k, n) : "(vacío)"}`]);
    }
  }
  return lista;
}

type RefCorto = { id: string; nombre: string; tipo: TipoReferente };

/** Busca un referente por id o por nombre (sin tildes). Si hay varios, devuelve las opciones. */
async function resolverReferente(supabase: Supabase, valor: string): Promise<{ ref?: RefCorto; error?: string; opciones?: RefCorto[] }> {
  if (esUuid(valor)) {
    const { data } = await supabase.from("referentes").select("id,nombre,tipo").eq("id", valor).maybeSingle();
    return data ? { ref: data as RefCorto } : { error: "No existe un referente con ese id." };
  }
  const { data, error } = await supabase.from("referentes").select("id,nombre,tipo").order("nombre").limit(1000);
  if (error) return { error: "No se pudo consultar." };
  const todos = (data ?? []) as RefCorto[];
  const k = normalizar(valor);
  const exactos = todos.filter((r) => normalizar(r.nombre) === k);
  const lista = exactos.length ? exactos : todos.filter((r) => normalizar(r.nombre).includes(k));
  if (lista.length === 1) return { ref: lista[0] };
  if (lista.length === 0) return { error: `No hay ningún referente que se llame "${valor}".` };
  return { error: "Hay varios referentes con ese nombre. Pregunta cuál es.", opciones: lista.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
async function buscarPersonas(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const t = cadena(input.texto, 100);
  if (!t || t.length < 2) return fallo("Escribe al menos 2 letras o números.");
  const [personas, refs] = await Promise.all([
    ctx.supabase.rpc("buscar_personas", { p_texto: t }),
    ctx.supabase.from("referentes").select("id,nombre,tipo").order("nombre").limit(1000),
  ]);
  if (personas.error || refs.error) return fallo("No se pudo buscar.");
  const k = normalizar(t);
  const referentes = ((refs.data ?? []) as RefCorto[])
    .filter((r) => normalizar(r.nombre).includes(k))
    .slice(0, 10)
    .map((r) => ({ id: r.id, nombre: r.nombre, tipo: nombreTipo(r.tipo) }));
  // La búsqueda trae solo los últimos dígitos de la cédula; se completan los datos de contacto.
  const halladas = (personas.data ?? []) as { id: string; nombre: string; barrio: string | null; referente_nombre: string | null; referente_tipo: TipoReferente | null }[];
  const contacto = await datosContacto(ctx, halladas.map((p) => p.id));
  return {
    resultado: {
      personas: halladas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        ...contacto.get(p.id),
        barrio: p.barrio,
        referente: p.referente_nombre ? `${p.referente_nombre} (${nombreTipo(p.referente_tipo!)})` : null,
      })),
      referentes,
    },
  };
}

/** Cédula, celular y dirección de varias personas (ella está autorizada a verlos). */
async function datosContacto(ctx: Contexto, ids: string[]) {
  const mapa = new Map<string, { cedula: string | null; celular: string | null; direccion: string | null }>();
  if (!ids.length) return mapa;
  const { data } = await ctx.supabase.from("personas").select("id,cedula,celular,direccion").in("id", ids);
  for (const p of data ?? []) mapa.set(p.id, { cedula: p.cedula, celular: p.celular, direccion: p.direccion });
  return mapa;
}

async function verPersona(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const id = cadena(input.persona, 40);
  if (!id || !esUuid(id)) return fallo("Falta el id de la persona. Búscala con buscar_personas.");
  const [p, vinculos] = await Promise.all([
    ctx.supabase
      .from("personas")
      .select("id,nombre,cedula,celular,direccion,barrio,municipio_verificacion,puesto_votacion,mesa,observaciones,autorizacion_datos,fecha_autorizacion")
      .eq("id", id)
      .maybeSingle(),
    ctx.supabase
      .from("vinculos")
      .select("coordinador,fecha_vinculo,referente:referentes!inner(nombre,tipo)")
      .eq("persona_id", id)
      .eq("activo", true)
      .overrideTypes<{ coordinador: string | null; fecha_vinculo: string; referente: { nombre: string; tipo: TipoReferente } }[], { merge: false }>(),
  ]);
  if (!p.data) return fallo("No existe esa persona.");
  return {
    resultado: {
      ...p.data,
      municipio_verificacion: p.data.municipio_verificacion ?? "sin verificar",
      fecha_autorizacion: p.data.fecha_autorizacion ? String(p.data.fecha_autorizacion).slice(0, 10) : null,
      referentes: (vinculos.data ?? []).map((v) => ({
        nombre: v.referente.nombre,
        tipo: nombreTipo(v.referente.tipo),
        coordinador: v.coordinador,
        desde: v.fecha_vinculo,
      })),
    },
  };
}

async function verReferente(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const v = cadena(input.referente, 120);
  if (!v) return fallo("Falta el referente.");
  const r = await resolverReferente(ctx.supabase, v);
  if (!r.ref) return { resultado: { error: r.error, opciones: r.opciones }, error: true };

  const [ficha, personas] = await Promise.all([
    ctx.supabase
      .from("referentes")
      .select("id,tipo,nombre,barrio,municipio,puesto_votacion,mesa,municipio_verificacion,coordinador,empresa,zona_influencia")
      .eq("id", r.ref.id)
      .single(),
    ctx.supabase.rpc("personas_de_referente", { p_referente: r.ref.id }),
  ]);
  if (ficha.error || personas.error) return fallo("No se pudo consultar.");
  const lista = (personas.data ?? []) as ({ id: string } & Record<string, unknown>)[];
  const p = pagina(lista, Number(input.desde ?? 0), MAX_RESULTADOS);
  let filas: Record<string, unknown>[] = p.filas;
  if (input.con_contacto === true) {
    const contacto = await datosContacto(ctx, p.filas.map((x) => x.id));
    filas = p.filas.map((x) => ({ ...x, ...contacto.get(x.id) }));
  }
  return {
    resultado: {
      referente: { ...ficha.data, tipo: nombreTipo(ficha.data.tipo as TipoReferente) },
      total_personas: p.total,
      desde: p.desde,
      personas: filas,
      siguiente: p.siguiente,
    },
  };
}

async function resumenPanel(ctx: Contexto): Promise<Salida> {
  const [totales, calidad, refs, barrios] = await Promise.all([
    ctx.supabase.from("panel_totales").select("tipo,referentes,personas"),
    ctx.supabase.from("panel_calidad").select("*").single(),
    ctx.supabase.from("panel_referentes").select("nombre,tipo,total_personas").order("total_personas", { ascending: false }).limit(1000),
    ctx.supabase.from("panel_barrios").select("barrio,personas").order("personas", { ascending: false }).limit(15),
  ]);
  if (totales.error || calidad.error || refs.error || barrios.error) return fallo("No se pudo consultar el panel.");
  const lista = refs.data ?? [];
  return {
    resultado: {
      por_eje: (totales.data ?? []).map((t) => ({ eje: EJES[t.tipo === "lider" ? "lideres" : t.tipo === "empresario" ? "empresarios" : "aliados"].titulo, referentes: t.referentes, personas: t.personas })),
      calidad_de_datos: calidad.data,
      referentes_con_mas_personas: lista.slice(0, 15),
      referentes_con_menos_personas: lista.slice(-10).reverse(),
      barrios_con_mas_personas: barrios.data,
    },
  };
}

async function personasConProblemas(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const problema = cadena(input.problema, 30);
  if (!problema || !(PROBLEMAS as readonly string[]).includes(problema)) return fallo("Problema no válido.");
  let referenteId: string | null = null;
  const refTexto = cadena(input.referente, 120);
  if (refTexto) {
    const r = await resolverReferente(ctx.supabase, refTexto);
    if (!r.ref) return { resultado: { error: r.error, opciones: r.opciones }, error: true };
    referenteId = r.ref.id;
  }
  const { data, error } = await ctx.supabase.rpc("personas_con_problemas", {
    p_problema: problema,
    p_referente: referenteId,
    p_barrio: cadena(input.barrio, 80),
  });
  if (error) return fallo("No se pudo consultar.");
  const filas = (data ?? []) as Record<string, unknown>[];
  const total = Number(filas[0]?.total ?? 0);
  const visibles = filas.slice(0, MAX_RESULTADOS);
  const contacto = input.con_contacto === true ? await datosContacto(ctx, visibles.map((f) => String(f.id))) : null;
  return {
    resultado: {
      total,
      personas: visibles.map((f) => {
        const resto: Record<string, unknown> = { ...f, ...contacto?.get(String(f.id)) };
        delete resto.total;
        return resto;
      }),
      ...(total > filas.length ? { nota: `Se muestran ${filas.length} de ${total}.` } : {}),
    },
  };
}

async function listaReferentes(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const tipo = (cadena(input.tipo, 20) ?? "lider") as TipoReferente;
  if (!(TIPOS_REF as readonly string[]).includes(tipo)) return fallo("Tipo no válido.");
  const orden = (["mas", "menos", "nombre"].includes(String(input.orden)) ? input.orden : "mas") as Orden;
  const { data, error } = await ctx.supabase
    .from("referentes_resumen")
    .select("id,nombre,tipo,total_personas")
    .eq("tipo", tipo)
    .limit(5000);
  if (error) return fallo("No se pudo consultar.");
  const lista = ordenarReferentes(
    (data ?? []).map((r) => ({ id: r.id as string, nombre: r.nombre as string, personas: Number(r.total_personas) })),
    orden,
  );
  const p = pagina(lista, Number(input.desde ?? 0), MAX_RESULTADOS);
  return {
    resultado: {
      eje: nombreTipo(tipo),
      total_referentes: p.total,
      personas_en_total: lista.reduce((s, r) => s + r.personas, 0),
      desde: p.desde,
      referentes: p.filas,
      siguiente: p.siguiente,
    },
  };
}

async function problemasPorReferente(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const problema = cadena(input.problema, 30);
  if (!problema || !(PROBLEMAS_POR_REFERENTE as readonly string[]).includes(problema)) return fallo("Problema no válido.");
  const tipo = cadena(input.tipo, 20);
  if (tipo && !(TIPOS_REF as readonly string[]).includes(tipo)) return fallo("Tipo no válido.");
  const columna = { sin_cedula: "cedula", sin_puesto: "puesto_votacion", sin_verificar: "municipio_verificacion", sin_barrio: "barrio" }[
    problema as (typeof PROBLEMAS_POR_REFERENTE)[number]
  ];

  // Vínculos activos cuya persona tiene vacío ese campo (filtro sobre la tabla unida), por páginas.
  type Fila = { persona_id: string; referente: { id: string; nombre: string; tipo: TipoReferente } };
  const filas: Fila[] = [];
  for (let desde = 0; desde < 20000; desde += 1000) {
    let q = ctx.supabase
      .from("vinculos")
      .select("id,persona_id,referente:referentes!inner(id,nombre,tipo),persona:personas!inner(id)")
      .eq("activo", true)
      .is(`persona.${columna}`, null);
    if (tipo) q = q.eq("referente.tipo", tipo);
    const { data, error } = await q.order("id").range(desde, desde + 999).overrideTypes<Fila[], { merge: false }>();
    if (error) return fallo("No se pudo consultar.");
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { referentes, personas } = contarPorReferente(filas);
  return {
    resultado: {
      problema,
      personas_afectadas_con_referente: personas,
      referentes_con_el_problema: referentes.length,
      por_referente: referentes.slice(0, MAX_RESULTADOS).map((r) => ({ id: r.id, nombre: r.nombre, tipo: nombreTipo(r.tipo), personas: r.personas })),
      ...(referentes.length > MAX_RESULTADOS ? { nota: `Se muestran ${MAX_RESULTADOS} de ${referentes.length} referentes.` } : {}),
      aviso: "Las personas sin ningún referente no aparecen aquí (usa personas_con_problemas con sin_lider).",
    },
  };
}

// ---------------------------------------------------------------------------
// Propuestas (no guardan)
// ---------------------------------------------------------------------------
const COLS_PERSONA = "id,nombre,cedula,celular,direccion,barrio,municipio_verificacion,puesto_votacion,mesa,observaciones,autorizacion_datos,fecha_autorizacion";
const COLS_REFERENTE = "id,tipo,nombre,cedula,celular,direccion,barrio,municipio,puesto_votacion,mesa,municipio_verificacion,coordinador,empresa,zona_influencia";
const LISTO = "Borrador mostrado en una tarjeta. Espera a que la usuaria lo confirme o lo descarte; todavía no se ha guardado nada.";

// Toma de la entrada solo los campos permitidos, como texto.
function camposEntrada(input: Record<string, unknown>, campos: readonly string[]) {
  const d: Partial<Record<Campo, string>> = {};
  const vaciar: string[] = [];
  for (const c of campos) {
    if (!(c in input)) continue;
    const v = cadena(input[c]);
    if (v === null) vaciar.push(c);
    else d[c as Campo] = v;
  }
  return { d, vaciar };
}

async function proponerPersona(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const id = cadena(input.id, 40);
  if (id && !esUuid(id)) return fallo("Id de persona no válido.");
  const campos = CAMPOS_PERSONA.filter((c) => c !== "coordinador");
  const { d, vaciar } = camposEntrada(input, campos);

  let antes: Record<string, string> | null = null;
  if (id) {
    const { data } = await ctx.supabase.from("personas").select(COLS_PERSONA).eq("id", id).maybeSingle();
    if (!data) return fallo("No existe esa persona.");
    const fila = data as Record<string, unknown>;
    antes = aDatos(fila, campos);
    if (fila.autorizacion_datos) antes.autorizacion_datos = "on";
    if (fila.fecha_autorizacion) antes.fecha_autorizacion = String(fila.fecha_autorizacion).slice(0, 10);
  }

  const { datos: limpios, problema } = prepararCampos(d);
  if (problema) return fallo(problema);
  const datos: Record<string, string> = { ...(antes ?? {}), ...(limpios as Record<string, string>) };
  for (const c of vaciar) delete datos[c];
  if (typeof input.autorizacion_datos === "boolean") {
    if (input.autorizacion_datos) datos.autorizacion_datos = "on";
    else {
      delete datos.autorizacion_datos;
      delete datos.fecha_autorizacion;
    }
  }

  // Mismas validaciones del formulario.
  const fd = aFormData(datos as Partial<Record<Campo, string>>);
  const r = leerPersona(fd, !!id, await ctx.catalogos());
  delete r.errores.referente_id;
  if (Object.keys(r.errores).length) return { resultado: { errores: r.errores }, error: true };

  if (r.fila.cedula) {
    const [p, ref] = await Promise.all([
      ctx.supabase.from("personas").select("id,nombre").eq("cedula", r.fila.cedula).maybeSingle(),
      ctx.supabase.from("referentes").select("id,nombre,tipo").eq("cedula", r.fila.cedula).maybeSingle(),
    ]);
    if (p.data && p.data.id !== id) return fallo(`Esa cédula ya es de la persona ${p.data.nombre} (id ${p.data.id}).`);
    if (ref.data) return fallo(`Esa cédula es de ${nombreTipo(ref.data.tipo as TipoReferente).toLowerCase()} ${ref.data.nombre}: una persona no puede ser también referente.`);
  }

  let referente: { id: string; nombre: string } | null = null;
  const refTexto = cadena(input.referente, 120);
  if (refTexto && !id) {
    const rr = await resolverReferente(ctx.supabase, refTexto);
    if (!rr.ref) return { resultado: { error: rr.error, opciones: rr.opciones }, error: true };
    referente = { id: rr.ref.id, nombre: rr.ref.nombre };
  }
  const coordinador = referente ? cadena(input.coordinador, 120) : null;

  const tarjeta = camposTarjeta(datos, antes);
  if (antes && tarjeta.length === 0) return fallo("No hay ningún cambio frente a lo que ya tiene guardado.");
  if (referente) tarjeta.push(["Vincular a", referente.nombre + (coordinador ? ` (coordinador: ${coordinador})` : "")]);

  const borrador: Borrador = {
    clase: "persona",
    accion: id ? "editar" : "crear",
    registroId: id,
    titulo: id ? `Editar a ${datos.nombre}` : `Crear persona: ${datos.nombre}`,
    datos,
    referente,
    coordinador,
    campos: tarjeta,
  };
  return { resultado: { ok: true, mensaje: LISTO }, evento: { tipo: "borrador", borrador } };
}

async function proponerReferente(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const id = cadena(input.id, 40);
  if (id && !esUuid(id)) return fallo("Id de referente no válido.");
  const { d, vaciar } = camposEntrada(input, CAMPOS_REFERENTE);

  let antes: Record<string, string> | null = null;
  let tipo = cadena(input.tipo, 20) as TipoReferente | null;
  if (id) {
    const { data } = await ctx.supabase.from("referentes").select(COLS_REFERENTE).eq("id", id).maybeSingle();
    if (!data) return fallo("No existe ese referente.");
    antes = aDatos(data as Record<string, unknown>, CAMPOS_REFERENTE);
    tipo = data.tipo as TipoReferente; // el tipo no cambia al editar
  }
  if (!tipo || !(TIPOS_REF as readonly string[]).includes(tipo)) return fallo("Indica si es líder, empresario o aliado.");

  const { datos: limpios, problema } = prepararCampos(d);
  if (problema) return fallo(problema);
  const datos: Record<string, string> = { ...(antes ?? {}), ...(limpios as Record<string, string>) };
  for (const c of vaciar) delete datos[c];

  const r = leerReferente(aFormData(datos as Partial<Record<Campo, string>>), tipo, await ctx.catalogos());
  if (Object.keys(r.errores).length) return { resultado: { errores: r.errores }, error: true };

  if (r.cedula) {
    const [ref, p] = await Promise.all([
      ctx.supabase.from("referentes").select("id,nombre").eq("cedula", r.cedula).maybeSingle(),
      ctx.supabase.from("personas").select("id,nombre").eq("cedula", r.cedula).maybeSingle(),
    ]);
    if (ref.data && ref.data.id !== id) return fallo(`Esa cédula ya es del referente ${ref.data.nombre} (id ${ref.data.id}).`);
    if (p.data) return fallo(`Esa cédula es de la persona ${p.data.nombre}: una persona no puede ser también referente.`);
  }

  const tarjeta = camposTarjeta(datos, antes);
  if (antes && tarjeta.length === 0) return fallo("No hay ningún cambio frente a lo que ya tiene guardado.");
  const borrador: Borrador = {
    clase: "referente",
    accion: id ? "editar" : "crear",
    registroId: id,
    tipo,
    titulo: id ? `Editar a ${datos.nombre}` : `Crear ${nombreTipo(tipo).toLowerCase()}: ${datos.nombre}`,
    datos,
    campos: tarjeta,
  };
  return { resultado: { ok: true, mensaje: LISTO }, evento: { tipo: "borrador", borrador } };
}

async function proponerVinculo(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const personaId = cadena(input.persona, 40);
  if (!personaId || !esUuid(personaId)) return fallo("Falta el id de la persona. Búscala con buscar_personas.");
  const refTexto = cadena(input.referente, 120);
  if (!refTexto) return fallo("Falta el referente.");

  const [p, rr] = await Promise.all([
    ctx.supabase.from("personas").select("id,nombre").eq("id", personaId).maybeSingle(),
    resolverReferente(ctx.supabase, refTexto),
  ]);
  if (!p.data) return fallo("No existe esa persona.");
  if (!rr.ref) return { resultado: { error: rr.error, opciones: rr.opciones }, error: true };

  const { data: actuales } = await ctx.supabase
    .from("vinculos")
    .select("referente_id,referente:referentes!inner(nombre)")
    .eq("persona_id", personaId)
    .eq("activo", true)
    .overrideTypes<{ referente_id: string; referente: { nombre: string } }[], { merge: false }>();
  if (actuales?.some((v) => v.referente_id === rr.ref!.id)) return fallo("Esa persona ya está vinculada a ese referente.");

  const coordinador = cadena(input.coordinador, 120);
  const campos: [string, string][] = [
    ["Persona", p.data.nombre],
    [nombreTipo(rr.ref.tipo), rr.ref.nombre],
  ];
  if (coordinador) campos.push(["Coordinador", coordinador]);
  if (actuales?.length) campos.push(["Ya está con", actuales.map((v) => v.referente.nombre).join(", ")]);

  const borrador: Borrador = {
    clase: "vinculo",
    titulo: `Vincular a ${p.data.nombre}`,
    persona: { id: p.data.id, nombre: p.data.nombre },
    referente: { id: rr.ref.id, nombre: rr.ref.nombre },
    coordinador,
    campos,
  };
  return {
    resultado: { ok: true, mensaje: LISTO, ...(actuales?.length ? { aviso: "La persona ya está con otro referente." } : {}) },
    evento: { tipo: "borrador", borrador },
  };
}

// ---------------------------------------------------------------------------
// Mapeo de un archivo
// ---------------------------------------------------------------------------
function leerMapeo(input: Record<string, unknown>): Mapeo | string {
  const hoja = cadena(input.hoja, 120);
  const tipo = cadena(input.tipo, 20) as TipoImportacion | null;
  if (!hoja) return "Falta la hoja.";
  if (!tipo || !TIPOS_IMPORTACION.includes(tipo)) return "Tipo de registro no válido.";
  const columnas: Mapeo["columnas"] = {};
  for (const [k, v] of Object.entries(obj(input.columnas))) {
    const c = cadena(v, 200);
    if (c) columnas[k as Campo] = c;
  }
  const vin = obj(input.vinculo);
  let vinculo: Mapeo["vinculo"] = null;
  if (vin.modo === "columna" && cadena(vin.columna)) vinculo = { modo: "columna", columna: cadena(vin.columna, 200)! };
  else if (vin.modo === "fijo" && cadena(vin.referente)) vinculo = { modo: "fijo", referente: cadena(vin.referente, 120)! };
  const filtro: Condicion[] = [];
  for (const f of Array.isArray(input.filtro) ? input.filtro.slice(0, 10) : []) {
    const o = obj(f);
    const operador = o.operador as Condicion["operador"];
    const columna = cadena(o.columna, 200);
    if (!columna || !["igual", "distinto", "contiene", "vacio", "no_vacio"].includes(operador)) return "Filtro no válido.";
    filtro.push({ columna, operador, valor: cadena(o.valor, 200) ?? undefined });
  }
  return { hoja, tipo, columnas, vinculo, filtro, todas_autorizaron: input.todas_autorizaron === true };
}

/** Hojas del archivo adjunto que tienen el formato de la campaña. */
const hojasCampana = (ctx: Contexto) => Object.entries(ctx.hojas).filter(([, enc]) => detectarFormatoCampana(enc)).map(([h]) => h);

async function filtrarImportacion(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const candidatas = hojasCampana(ctx);
  if (!candidatas.length) return fallo("El archivo adjunto no tiene el formato de la campaña. Use proponer_mapeo.");
  const pedida = cadena(input.hoja, 120);
  let hoja: string;
  if (pedida) {
    if (!candidatas.includes(pedida)) return fallo(`La hoja "${pedida}" no tiene el formato de la campaña. Hojas con el formato: ${candidatas.join(", ")}.`);
    hoja = pedida;
  } else if (candidatas.length === 1) hoja = candidatas[0]!;
  else return fallo(`Hay varias hojas con el formato de la campaña: ${candidatas.join(", ")}. Pregúntele cuál importar.`);

  const alcance = (ALCANCES.includes(input.alcance as Alcance) ? input.alcance : "todo") as Alcance;
  const lideres = (Array.isArray(input.lideres) ? input.lideres : []).map((l) => cadena(l, 200)).filter((l): l is string => !!l).slice(0, 50);
  const condiciones: Condicion[] = [];
  const encabezados = ctx.hojas[hoja]!;
  for (const c of Array.isArray(input.condiciones) ? input.condiciones.slice(0, 10) : []) {
    const o = obj(c);
    const columna = cadena(o.columna, 200);
    const operador = o.operador as Condicion["operador"];
    if (!columna || !encabezados.includes(columna) || !["igual", "distinto", "contiene", "vacio", "no_vacio"].includes(operador)) {
      return fallo(`Condición no válida. Columnas de la hoja: ${encabezados.join(", ")}.`);
    }
    condiciones.push({ columna, operador, valor: cadena(o.valor, 200) ?? undefined });
  }
  return {
    resultado: { ok: true, mensaje: "La interfaz está revisando todas las filas; recibirás el resumen de la vista previa." },
    evento: { tipo: "importar_campana", hoja, filtro: { alcance, lideres, condiciones } },
  };
}

async function proponerMapeo(ctx: Contexto, input: Record<string, unknown>): Promise<Salida> {
  const m = leerMapeo(input);
  if (typeof m === "string") return fallo(m);
  const encabezados = ctx.hojas[m.hoja];
  if (!encabezados) return fallo(`No hay ninguna hoja llamada "${m.hoja}" en el archivo adjunto.`);
  if (detectarFormatoCampana(encabezados)) return fallo("Esa hoja tiene el formato de la campaña: use filtrar_importacion (no hace falta mapear).");
  const errores = revisarMapeo(m, encabezados);
  if (errores.length) return { resultado: { errores }, error: true };
  if (m.vinculo?.modo === "fijo") {
    const r = await resolverReferente(ctx.supabase, m.vinculo.referente);
    if (!r.ref) return { resultado: { error: r.error, opciones: r.opciones }, error: true };
    m.vinculo = { modo: "fijo", referente: r.ref.id };
  }
  return {
    resultado: { ok: true, mensaje: "Mapeo enviado. La interfaz revisará todas las filas y te mandará el resumen de la vista previa." },
    evento: { tipo: "mapeo", mapeo: m },
  };
}

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------
const ESTADOS: Record<string, string> = {
  buscar_personas: "Buscando…",
  ver_referente: "Consultando el referente…",
  ver_persona: "Consultando la persona…",
  resumen_panel: "Revisando las cifras…",
  personas_con_problemas: "Revisando los datos…",
  lista_referentes: "Contando por referente…",
  problemas_por_referente: "Contando por referente…",
  proponer_persona: "Preparando el borrador…",
  proponer_referente: "Preparando el borrador…",
  proponer_vinculo: "Preparando el borrador…",
  proponer_mapeo: "Preparando la importación…",
  filtrar_importacion: "Preparando la importación…",
};
export const estadoDe = (nombre: string) => ESTADOS[nombre] ?? "Trabajando…";

export async function ejecutar(ctx: Contexto, nombre: string, entrada: unknown): Promise<Salida> {
  const input = obj(entrada);
  try {
    switch (nombre) {
      case "buscar_personas": return await buscarPersonas(ctx, input);
      case "ver_referente": return await verReferente(ctx, input);
      case "ver_persona": return await verPersona(ctx, input);
      case "resumen_panel": return await resumenPanel(ctx);
      case "personas_con_problemas": return await personasConProblemas(ctx, input);
      case "lista_referentes": return await listaReferentes(ctx, input);
      case "problemas_por_referente": return await problemasPorReferente(ctx, input);
      case "proponer_persona": return await proponerPersona(ctx, input);
      case "proponer_referente": return await proponerReferente(ctx, input);
      case "proponer_vinculo": return await proponerVinculo(ctx, input);
      case "proponer_mapeo": return await proponerMapeo(ctx, input);
      case "filtrar_importacion": return await filtrarImportacion(ctx, input);
      default: return fallo(`Herramienta desconocida: ${nombre}`);
    }
  } catch {
    return fallo("Hubo un error al consultar. Intenta de nuevo.");
  }
}
