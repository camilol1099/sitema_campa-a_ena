"use server";

import { refresh } from "next/cache";
import { CATALOGOS } from "@/lib/catalogos";
import { catalogos } from "@/lib/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EJES, esUuid, type TipoReferente } from "@/lib/ejes";
import { leerPersona, leerReferente, type Nuevo } from "@/lib/formularios";
import { rutaPersona, rutaReferente } from "@/lib/rutas";
import { NOMBRE_SIN_LIDER } from "@/lib/sin-lider";
import { limpiarCedula, textoOpcional } from "@/lib/validacion";

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
  return rutaPersona(personaId, data?.referente);
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
    href: rutaReferente(data.tipo, data.id),
  };
}

// Agrega a los catálogos los barrios, municipios o puestos nuevos.
// Si ya existían (otra pestaña los agregó), no pasa nada.
async function agregarNuevos(supabase: Supabase, nuevos: Nuevo[]) {
  for (const { cat, nombre } of nuevos) {
    const { error } = await supabase
      .from(CATALOGOS[cat].tabla)
      .upsert({ nombre }, { onConflict: "nombre", ignoreDuplicates: true });
    if (error) return false;
  }
  return true;
}

// Líder especial "Sin líder asignado" (lib/sin-lider.ts). Si no existe y se
// pide, se crea. Devuelve su id o null.
async function idSinLider(supabase: Supabase, crear: boolean): Promise<string | null> {
  const { data } = await supabase
    .from("referentes")
    .select("id")
    .eq("tipo", "lider")
    .eq("nombre", NOMBRE_SIN_LIDER)
    .limit(1)
    .maybeSingle();
  if (data || !crear) return data?.id ?? null;
  const nuevo = await supabase.from("referentes").insert({ tipo: "lider", nombre: NOMBRE_SIN_LIDER }).select("id").single();
  return nuevo.data?.id ?? null;
}

// Al vincular una persona a un líder real, sale de "Sin líder asignado".
async function sacarDeSinLider(supabase: Supabase, personaId: string, referenteId: string) {
  const sl = await idSinLider(supabase, false);
  if (!sl || sl === referenteId) return;
  await supabase.from("vinculos").update({ activo: false }).eq("persona_id", personaId).eq("referente_id", sl).eq("activo", true);
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
      "id,tipo,nombre,cedula,celular,direccion,barrio,municipio,puesto_votacion,mesa,municipio_verificacion,coordinador,empresa,zona_influencia",
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

  const { errores, fila, cedula, nuevos } = leerReferente(formData, tipo, await catalogos());
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
    // Nadie puede ser persona y referente a la vez.
    const persona = await personaConCedula(supabase, cedula, null);
    if (persona) {
      return {
        ok: false,
        errores: { cedula: "Esta cédula es de una persona registrada; no puede ser también referente." },
        existente: persona,
      };
    }
  }

  if (!(await agregarNuevos(supabase, nuevos))) return { ok: false, mensaje: ERROR_GENERAL };

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
  return { ok: true, href: rutaReferente(tipo, r.data.id) };
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export async function guardarPersona(formData: FormData): Promise<Resultado> {
  const id = textoOpcional(formData.get("id"));
  if (id !== null && !esUuid(id)) return { ok: false, mensaje: ERROR_GENERAL };

  const { errores, fila, referenteId, coordinador, nuevos } = leerPersona(
    formData,
    id !== null,
    await catalogos(),
  );
  const cedula = fila.cedula;
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
    // Nadie puede ser persona y referente a la vez.
    const referente = await referenteConCedula(supabase, cedula, null);
    if (referente) {
      return {
        ok: false,
        errores: { cedula: "Esta cédula es de un referente; una persona no puede ser también referente." },
        existente: referente,
      };
    }
  }

  if (!(await agregarNuevos(supabase, nuevos))) return { ok: false, mensaje: ERROR_GENERAL };

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
  // Al crear sin líder, queda con "Sin líder asignado" para no perderla de vista.
  const destino = referenteId ?? (id ? null : await idSinLider(supabase, true));
  if (destino) {
    const v = await supabase.from("vinculos").insert({
      persona_id: personaId,
      referente_id: destino,
      coordinador,
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
  await sacarDeSinLider(supabase, personaId, referenteId);

  const { data: ref } = await supabase
    .from("referentes")
    .select("tipo")
    .eq("id", referenteId)
    .single();

  refresh();
  return {
    ok: true,
    href: ref ? rutaPersona(personaId, { id: referenteId, tipo: ref.tipo }) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Panel de Revisión: arreglar una persona ahí mismo
// ---------------------------------------------------------------------------
// Marca que dejó la importación del Excel ("Cédula X repetida en el Excel: ... Revisar.").
const MARCA_REPETIDA = /Cédula \d+ repetida en el Excel:[^]*?Revisar\.\s*/g;

export async function arreglarPersona(formData: FormData): Promise<Resultado> {
  const id = String(formData.get("id") ?? "");
  if (!esUuid(id)) return { ok: false, mensaje: ERROR_GENERAL };
  const errores: Record<string, string> = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escriba el nombre.";
  const ced = limpiarCedula(textoOpcional(formData.get("cedula")));
  if (ced.error) errores.cedula = ced.error;
  const referenteId = textoOpcional(formData.get("referente_id"));
  if (referenteId && !esUuid(referenteId)) errores.referente_id = "Elija un líder de la lista.";
  if (Object.keys(errores).length) return { ok: false, errores };

  let observaciones = textoOpcional(formData.get("observaciones"));
  // "No es la misma persona": se quita el aviso de cédula repetida.
  if (formData.get("quitar_aviso") === "1" && observaciones) observaciones = observaciones.replace(MARCA_REPETIDA, "").trim() || null;

  const supabase = await crearClienteServidor();
  if (ced.cedula) {
    const otra = await personaConCedula(supabase, ced.cedula, id);
    if (otra) return { ok: false, errores: { cedula: `Esta cédula ya es de ${otra.nombre}.` }, existente: otra };
    const ref = await referenteConCedula(supabase, ced.cedula, null);
    if (ref) return { ok: false, errores: { cedula: "Esta cédula es de un referente; una persona no puede ser también referente." }, existente: ref };
  }

  const r = await supabase
    .from("personas")
    .update({
      nombre,
      cedula: ced.cedula,
      celular: textoOpcional(formData.get("celular")),
      direccion: textoOpcional(formData.get("direccion")),
      observaciones,
    })
    .eq("id", id);
  if (r.error) {
    if (r.error.code === "23505") return { ok: false, errores: { cedula: "Esta cédula ya está registrada." } };
    if (r.error.code === "23514") return { ok: false, errores: { cedula: "La cédula debe tener entre 6 y 10 dígitos." } };
    return { ok: false, mensaje: ERROR_GENERAL };
  }

  // Líder nuevo: se vincula y, si estaba en "Sin líder asignado", sale de ahí.
  if (referenteId) {
    const fd = new FormData();
    fd.set("persona_id", id);
    fd.set("referente_id", referenteId);
    const v = await vincularPersona(fd);
    if (!v.ok && v.mensaje !== "Esta persona ya está vinculada a este referente.") {
      refresh();
      return { ok: false, mensaje: "Los datos se guardaron, pero no se pudo cambiar el líder. Intente de nuevo." };
    }
  }

  refresh();
  return { ok: true };
}

// "Es la misma persona": se borra el registro repetido (queda en el historial).
export async function eliminarPersona(id: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, mensaje: ERROR_GENERAL };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("personas").delete().eq("id", id);
  if (error) return { ok: false, mensaje: "No se pudo borrar. Intente de nuevo." };
  refresh();
  return { ok: true };
}
