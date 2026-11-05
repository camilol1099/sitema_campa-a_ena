"use server";

import { refresh } from "next/cache";
import { CATALOGOS } from "@/lib/catalogos";
import { catalogos } from "@/lib/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { EJES, esUuid, type TipoReferente } from "@/lib/ejes";
import { leerPersona, leerReferente, type Nuevo } from "@/lib/formularios";
import { rutaPersona, rutaReferente } from "@/lib/rutas";
import { textoOpcional } from "@/lib/validacion";

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
      "id,tipo,nombre,cedula,celular,direccion,barrio,municipio,empresa,zona_influencia",
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
  if (referenteId) {
    const v = await supabase.from("vinculos").insert({
      persona_id: personaId,
      referente_id: referenteId,
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
