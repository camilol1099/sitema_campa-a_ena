import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATALOGOS, type Catalogo, type Catalogos } from "./catalogos";
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
        "id,tipo,nombre,cedula,barrio,municipio,empresa,zona_influencia",
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
