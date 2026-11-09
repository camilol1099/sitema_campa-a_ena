import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATALOGOS, type Catalogo, type Catalogos } from "./catalogos";
import { NOMBRE_SIN_LIDER } from "./sin-lider";
import type { TipoReferente } from "./ejes";
import type {
  CifrasEje,
  EventoHistorial,
  PanelBarrio,
  PanelCalidad,
  PanelReferente,
  PanelTotal,
  Persona,
  PersonaDeReferente,
  ReferenteFicha,
  ReferenteResumen,
  VinculoDePersona,
} from "./tipos";

// Todas las consultas usan la sesión del usuario: RLS decide qué puede ver.
// Si algo falla se lanza el error para que la pantalla lo muestre, en vez de
// enseñar listas vacías que parezcan datos reales.

function revisar<T>(r: { data: T | null; error: { message: string } | null }) {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const COLUMNAS_RESUMEN =
  "id,tipo,nombre,barrio,empresa,zona_influencia,total_personas,cedula";

// Se usa en la barra superior y en la página: cache() evita consultar dos veces.
export const todosLosReferentes = cache(
  async (): Promise<ReferenteResumen[]> => {
    const supabase = await crearClienteServidor();
    return revisar(
      await supabase
        .from("referentes_resumen")
        .select(COLUMNAS_RESUMEN)
        .order("nombre"),
    );
  },
);

export async function cifrasEje(tipo: TipoReferente): Promise<CifrasEje> {
  const supabase = await crearClienteServidor();
  const filas = revisar<CifrasEje[]>(
    await supabase.rpc("cifras_eje", { p_tipo: tipo }),
  );
  return filas[0]!;
}

// Ficha corta: sin celular ni dirección (se guardan, pero no se muestran).
export async function referente(id: string): Promise<ReferenteFicha | null> {
  const supabase = await crearClienteServidor();
  return revisar(
    await supabase
      .from("referentes")
      .select(
        "id,tipo,nombre,cedula,barrio,municipio,puesto_votacion,mesa,municipio_verificacion,coordinador,empresa,zona_influencia",
      )
      .eq("id", id)
      .maybeSingle(),
  );
}

export async function personasDeReferente(
  id: string,
): Promise<PersonaDeReferente[]> {
  const supabase = await crearClienteServidor();
  return revisar(await supabase.rpc("personas_de_referente", { p_referente: id }));
}

export async function persona(id: string): Promise<{
  persona: Persona;
  vinculos: VinculoDePersona[];
  historial: EventoHistorial[];
} | null> {
  const supabase = await crearClienteServidor();

  const p = revisar<Persona | null>(
    await supabase
      .from("personas")
      .select(
        "id,nombre,cedula,celular,direccion,barrio,municipio_verificacion,puesto_votacion,mesa,observaciones,autorizacion_datos,fecha_autorizacion,origen,created_at",
      )
      .eq("id", id)
      .maybeSingle(),
  );
  if (!p) return null;

  // referentes!inner devuelve un solo referente por vínculo (llave foránea).
  const vinculos = revisar(
    await supabase
      .from("vinculos")
      .select("id,coordinador,fecha_vinculo,nota,referente:referentes!inner(id,nombre,tipo)")
      .eq("persona_id", id)
      .eq("activo", true)
      .order("fecha_vinculo")
      .overrideTypes<VinculoDePersona[], { merge: false }>(),
  );

  // Historial de la persona y de todos sus vínculos (incluidos los inactivos).
  const todosVinculos = revisar<{ id: string }[]>(
    await supabase.from("vinculos").select("id").eq("persona_id", id),
  );
  const [deLaPersona, deSusVinculos] = await Promise.all([
    supabase
      .from("historial")
      .select("id,tabla,registro_id,accion,cambios,fecha")
      .eq("tabla", "personas")
      .eq("registro_id", id)
      .order("fecha", { ascending: false })
      .limit(15),
    todosVinculos.length
      ? supabase
          .from("historial")
          .select("id,tabla,registro_id,accion,cambios,fecha")
          .eq("tabla", "vinculos")
          .in(
            "registro_id",
            todosVinculos.map((v) => v.id),
          )
          .order("fecha", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const historial = [
    ...revisar<EventoHistorial[]>(deLaPersona),
    ...revisar<EventoHistorial[]>(deSusVinculos),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 15);

  return { persona: p, vinculos, historial };
}

// ---------- Catálogos (barrios, municipios, puestos) ----------
// Listas cortas: se cargan completas para los formularios.
export const catalogos = cache(async (): Promise<Catalogos> => {
  const supabase = await crearClienteServidor();
  const cats = Object.keys(CATALOGOS) as Catalogo[];
  const listas = await Promise.all(
    cats.map(async (c) =>
      revisar<{ nombre: string }[]>(
        await supabase.from(CATALOGOS[c].tabla).select("nombre").order("nombre").limit(5000),
      ).map((f) => f.nombre),
    ),
  );
  return Object.fromEntries(cats.map((c, i) => [c, listas[i]])) as Catalogos;
});

// ---------- Panel de avance ----------
// Vistas panel_* (security_invoker): RLS sigue protegiendo los datos.

export async function panelTotales(): Promise<PanelTotal[]> {
  const supabase = await crearClienteServidor();
  return revisar(
    await supabase.from("panel_totales").select("tipo,referentes,personas"),
  );
}

export async function panelReferentes(): Promise<PanelReferente[]> {
  const supabase = await crearClienteServidor();
  return revisar(
    await supabase
      .from("panel_referentes")
      .select("id,nombre,tipo,total_personas"),
  );
}

export async function panelBarrios(): Promise<PanelBarrio[]> {
  const supabase = await crearClienteServidor();
  return revisar(await supabase.from("panel_barrios").select("barrio,sin_barrio,personas"));
}

export async function panelCalidad(): Promise<PanelCalidad> {
  const supabase = await crearClienteServidor();
  return revisar(
    await supabase
      .from("panel_calidad")
      .select("sin_cedula,sin_barrio,sin_puesto,sin_verificar,sin_vinculo,varios_referentes")
      .single(),
  );
}

// ---------- Panel de Revisión ----------
// Personas que el sistema no sabe resolver solo: sin líder (con "Sin líder
// asignado"), cédula fuera de la regla (6 a 10 dígitos) y cédula repetida en el
// Excel (quedaron sin cédula y con una observación). Ella las corrige ahí mismo.
export type PersonaRevision = {
  id: string;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  barrio: string | null;
  observaciones: string | null;
  referentes: { id: string; nombre: string }[];
};
export type Revision = {
  sinLiderId: string | null;
  sinLider: PersonaRevision[];
  cedulaInvalida: PersonaRevision[];
  repetidaExcel: PersonaRevision[];
};

const COLUMNAS_REVISION = "id,nombre,cedula,celular,direccion,barrio,observaciones";
/** Marca que dejó la importación del Excel cuando la cédula estaba repetida. */
export const MARCA_REPETIDA = "Cédula % repetida en el Excel%";

export const revision = cache(async (): Promise<Revision> => {
  const supabase = await crearClienteServidor();
  const { data: sl } = await supabase
    .from("referentes")
    .select("id")
    .eq("tipo", "lider")
    .eq("nombre", NOMBRE_SIN_LIDER)
    .limit(1)
    .maybeSingle();
  const sinLiderId = sl?.id ?? null;

  const idsSinLider = sinLiderId
    ? revisar<{ persona_id: string }[]>(
        await supabase.from("vinculos").select("persona_id").eq("referente_id", sinLiderId).eq("activo", true).limit(1000),
      ).map((v) => v.persona_id)
    : [];

  const [sinLider, cedulaInvalida, repetidaExcel] = await Promise.all([
    idsSinLider.length
      ? supabase.from("personas").select(COLUMNAS_REVISION).in("id", idsSinLider).order("nombre")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("personas")
      .select(COLUMNAS_REVISION)
      .not("cedula", "is", null)
      .filter("cedula", "not.match", "^[0-9]{6,10}$")
      .order("nombre")
      .limit(500),
    supabase.from("personas").select(COLUMNAS_REVISION).is("cedula", null).ilike("observaciones", MARCA_REPETIDA).order("nombre").limit(500),
  ]);
  const listas = [sinLider, cedulaInvalida, repetidaExcel].map((r) => revisar<Omit<PersonaRevision, "referentes">[]>(r));

  // Líderes actuales de cada persona (para mostrarlos en la fila).
  const ids = [...new Set(listas.flat().map((p) => p.id))];
  const porPersona = new Map<string, { id: string; nombre: string }[]>();
  if (ids.length) {
    const vinculos = revisar(
      await supabase
        .from("vinculos")
        .select("persona_id,referente:referentes!inner(id,nombre)")
        .in("persona_id", ids)
        .eq("activo", true)
        .overrideTypes<{ persona_id: string; referente: { id: string; nombre: string } }[], { merge: false }>(),
    );
    for (const v of vinculos) porPersona.set(v.persona_id, [...(porPersona.get(v.persona_id) ?? []), v.referente]);
  }
  const conRefs = (xs: Omit<PersonaRevision, "referentes">[]) => xs.map((p) => ({ ...p, referentes: porPersona.get(p.id) ?? [] }));
  return {
    sinLiderId,
    sinLider: conRefs(listas[0]!),
    cedulaInvalida: conRefs(listas[1]!),
    repetidaExcel: conRefs(listas[2]!),
  };
});
