"use server";

import { refresh } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import {
  CAMPOS_TIPO,
  EJES,
  VERIFICACIONES,
  esUuid,
  slugDeTipo,
  type TipoReferente,
} from "@/lib/ejes";
import {
  enteroOpcional,
  textoOpcional,
  validarCedula,
} from "@/lib/validacion";

// Cada cambio pasa por la sesión del usuario (RLS) y los triggers de la base
// lo registran en `historial`.

export type Resultado = {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  // Si la cédula ya existe: el registro existente para abrirlo en vez de duplicarlo.
  existente?: { nombre: string; href: string };
  href?: string;
};

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

// Fecha de hoy (AAAA-MM-DD) en hora de Colombia.
const hoyEnColombia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

const ERROR_GENERAL ="No se pudo guardar. Revisa tu conexión e intenta de nuevo.";

// Dirección para abrir una persona en el eje y referente de su primer vínculo.
async function hrefPersona(supabase: Supabase, personaId: string) {
  const { data } = await supabase
    .from("vinculos")
    .select("referente:referentes!inner(id,tipo)")
    .eq("persona_id", personaId)
    .eq("activo", true)
    .order("fecha_vinculo")
    .limit(1)
    .maybeSingle<{ referente: { id: string; tipo: TipoReferente } }>();
  if (!data) return `/lideres?persona=${personaId}`;
  const { id, tipo } = data.referente;
  return `/${slugDeTipo(tipo)}?referente=${id}&persona=${personaId}`;
}

async function personaConCedula(
  supabase: Supabase,
  cedula: string,
  excepto: string | null,
) {
  let q = supabase.from("personas").select("id,nombre").eq("cedula", cedula);
  if (excepto) q = q.neq("id", excepto);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return { nombre: data.nombre, href: await hrefPersona(supabase, data.id) };
}

async function referenteConCedula(
  supabase: Supabase,
  cedula: string,
  excepto: string | null,
) {
  let q = supabase.from("referentes").select("id,nombre,tipo").eq("cedula", cedula);
  if (excepto) q = q.neq("id", excepto);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    nombre: data.nombre,
    href: `/${slugDeTipo(data.tipo)}?referente=${data.id}`,
  };
}

// ---------------------------------------------------------------------------
// Referentes (líder, empresario, aliado)
// ---------------------------------------------------------------------------
// Datos completos para el formulario de edición (incluye celular y dirección,
// que no se muestran en la ficha). Se piden solo al abrir el formulario.
export async function datosReferenteParaEditar(id: string) {
  if (!esUuid(id)) return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("referentes")
    .select(
      "id,tipo,nombre,cedula,celular,direccion,barrio,municipio,estado,meta_personas,notas,empresa,sector,cargo,partido_movimiento,cargo_politico,zona_influencia",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function guardarReferente(formData: FormData): Promise<Resultado> {
  const id = textoOpcional(formData.get("id"));
  const tipo = String(formData.get("tipo") ?? "") as TipoReferente;
  if (id !== null && !esUuid(id)) return { ok: false, mensaje: ERROR_GENERAL };
  if (!Object.values(EJES).some((e) => e.tipo === tipo)) {
    return { ok: false, mensaje: ERROR_GENERAL };
  }

  const errores: Record<string, string> = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  const cedula = textoOpcional(formData.get("cedula"));
  const errCedula = validarCedula(cedula);
  if (errCedula) errores.cedula = errCedula;
  const meta = enteroOpcional(formData.get("meta_personas"), 0);
  if (meta.error) errores.meta_personas = meta.error;
  const estado = formData.get("estado") === "inactivo" ? "inactivo" : "activo";
  if (Object.keys(errores).length) return { ok: false, errores };

  const supabase = await crearClienteServidor();

  if (cedula) {
    const existente = await referenteConCedula(supabase, cedula, id);
    if (existente) {
      return {
        ok: false,
        errores: { cedula: "Ya hay un referente con esta cédula." },
        existente,
      };
    }
  }

  const fila: Record<string, string | number | null> = {
    tipo,
    nombre,
    cedula,
    celular: textoOpcional(formData.get("celular")),
    direccion: textoOpcional(formData.get("direccion")),
    barrio: textoOpcional(formData.get("barrio")),
    municipio: textoOpcional(formData.get("municipio")),
    estado,
    meta_personas: meta.valor,
    notas: textoOpcional(formData.get("notas")),
  };
  for (const { campo } of CAMPOS_TIPO[tipo]) {
    fila[campo] = textoOpcional(formData.get(campo));
  }

  const r = id
    ? await supabase.from("referentes").update(fila).eq("id", id).select("id").single()
    : await supabase.from("referentes").insert(fila).select("id").single();

  if (r.error) {
    if (r.error.code === "23505") {
      return { ok: false, errores: { cedula: "Ya hay un referente con esta cédula." } };
    }
    if (r.error.code === "23514") {
      return { ok: false, errores: { cedula: "La cédula solo puede tener números." } };
    }
    return { ok: false, mensaje: ERROR_GENERAL };
  }

  refresh();
  return { ok: true, href: `/${slugDeTipo(tipo)}?referente=${r.data.id}` };
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export async function guardarPersona(formData: FormData): Promise<Resultado> {
  const id = textoOpcional(formData.get("id"));
  if (id !== null && !esUuid(id)) return { ok: false, mensaje: ERROR_GENERAL };

  const errores: Record<string, string> = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  const cedula = textoOpcional(formData.get("cedula"));
  const errCedula = validarCedula(cedula);
  if (errCedula) errores.cedula = errCedula;
  const mesa = enteroOpcional(formData.get("mesa"), 1);
  if (mesa.error) errores.mesa = mesa.error;

  const verificacion = textoOpcional(formData.get("municipio_verificacion"));
  if (verificacion && !(VERIFICACIONES as readonly string[]).includes(verificacion)) {
    errores.municipio_verificacion = "Elige una opción de la lista.";
  }

  const autorizo = formData.get("autorizacion_datos") === "on";
  const fechaAut = textoOpcional(formData.get("fecha_autorizacion"));
  if (fechaAut && !/^\d{4}-\d{2}-\d{2}$/.test(fechaAut)) {
    errores.fecha_autorizacion = "Fecha no válida.";
  }

  // Al crear, se puede vincular de una vez a un referente.
  const referenteId = id ? null : textoOpcional(formData.get("referente_id"));
  if (referenteId !== null && !esUuid(referenteId)) {
    errores.referente_id = "Elige un referente de la lista.";
  }
  if (Object.keys(errores).length) return { ok: false, errores };

  const supabase = await crearClienteServidor();

  if (cedula) {
    const existente = await personaConCedula(supabase, cedula, id);
    if (existente) {
      return {
        ok: false,
        errores: { cedula: "Ya hay una persona registrada con esta cédula." },
        existente,
      };
    }
  }

  const fila = {
    nombre,
    cedula,
    celular: textoOpcional(formData.get("celular")),
    direccion: textoOpcional(formData.get("direccion")),
    barrio: textoOpcional(formData.get("barrio")),
    municipio_verificacion: verificacion,
    puesto_votacion: textoOpcional(formData.get("puesto_votacion")),
    mesa: mesa.valor,
    observaciones: textoOpcional(formData.get("observaciones")),
    autorizacion_datos: autorizo,
    // Si autorizó y no se indicó fecha, se toma la de hoy.
    fecha_autorizacion: autorizo
      ? fechaAut
        ? `${fechaAut}T12:00:00-05:00`
        : new Date().toISOString()
      : null,
  };

  const r = id
    ? await supabase.from("personas").update(fila).eq("id", id).select("id").single()
    : await supabase.from("personas").insert(fila).select("id").single();

  if (r.error) {
    if (r.error.code === "23505" && cedula) {
      const existente = await personaConCedula(supabase, cedula, id);
      return {
        ok: false,
        errores: { cedula: "Ya hay una persona registrada con esta cédula." },
        existente: existente ?? undefined,
      };
    }
    if (r.error.code === "23514") {
      return { ok: false, mensaje: "Hay un dato no válido. Revisa la cédula y la mesa." };
    }
    return { ok: false, mensaje: ERROR_GENERAL };
  }

  const personaId = r.data.id;
  if (referenteId) {
    const v = await supabase.from("vinculos").insert({
      persona_id: personaId,
      referente_id: referenteId,
      coordinador: textoOpcional(formData.get("coordinador")),
    });
    if (v.error) {
      refresh();
      return {
        ok: false,
        mensaje: "La persona se guardó, pero no se pudo vincular. Vincúlala desde su ficha.",
        href: await hrefPersona(supabase, personaId),
      };
    }
  }

  refresh();
  return { ok: true, href: await hrefPersona(supabase, personaId) };
}

// ---------------------------------------------------------------------------
// Vínculos persona ↔ referente
// ---------------------------------------------------------------------------
export async function vincularPersona(formData: FormData): Promise<Resultado> {
  const personaId = String(formData.get("persona_id") ?? "");
  const referenteId = String(formData.get("referente_id") ?? "");
  if (!esUuid(personaId)) {
    return { ok: false, errores: { persona_id: "Elige una persona." } };
  }
  if (!esUuid(referenteId)) {
    return { ok: false, errores: { referente_id: "Elige un referente." } };
  }
  const coordinador = textoOpcional(formData.get("coordinador"));

  const supabase = await crearClienteServidor();

  const { data: previo, error: errPrevio } = await supabase
    .from("vinculos")
    .select("id,activo")
    .eq("persona_id", personaId)
    .eq("referente_id", referenteId)
    .maybeSingle();
  if (errPrevio) return { ok: false, mensaje: ERROR_GENERAL };
  if (previo?.activo) {
    return { ok: false, mensaje: "Esta persona ya está vinculada a este referente." };
  }

  // Si existió y se desvinculó, se reactiva (queda en el historial como edición).
  const r = previo
    ? await supabase
        .from("vinculos")
        .update({ activo: true, coordinador, fecha_vinculo: hoyEnColombia() })
        .eq("id", previo.id)
    : await supabase
        .from("vinculos")
        .insert({ persona_id: personaId, referente_id: referenteId, coordinador });

  if (r.error) return { ok: false, mensaje: ERROR_GENERAL };

  const { data: ref } = await supabase
    .from("referentes")
    .select("tipo")
    .eq("id", referenteId)
    .single();

  refresh();
  return {
    ok: true,
    href: ref
      ? `/${slugDeTipo(ref.tipo)}?referente=${referenteId}&persona=${personaId}`
      : undefined,
  };
}
