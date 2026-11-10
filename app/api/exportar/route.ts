import { connection } from "next/server";
import { aCsv } from "@/lib/csv";
import { crearClienteServidor } from "@/lib/supabase/server";

// Copia de seguridad en CSV: descarga una tabla completa.
// GET /api/exportar?tabla=personas|referentes|vinculos
// Exige sesión de administradora; lee con la sesión de la usuaria (RLS aplica,
// nunca la service_role key). Trae todas las filas de a 1000.

const TABLAS = ["personas", "referentes", "vinculos"] as const;
type Tabla = (typeof TABLAS)[number];

type Fila = Record<string, unknown>;
type Rel = { nombre?: string | null; tipo?: string | null; cedula?: string | null } | null;

// Columnas extra para leer el archivo sin cruzar tablas (van al final).
const CONSULTA: Record<Tabla, string> = {
  personas: "*, vinculos(activo, coordinador, referente:referentes(nombre))",
  referentes: "*",
  vinculos: "*, persona:personas(nombre, cedula), referente:referentes(nombre, tipo)",
};

function aplanar(tabla: Tabla, f: Fila): Fila {
  if (tabla === "personas") {
    const { vinculos, ...resto } = f as Fila & { vinculos?: { activo: boolean; coordinador: string | null; referente: Rel }[] };
    const activos = (vinculos ?? []).filter((v) => v.activo);
    return {
      ...resto,
      referentes_activos: activos.map((v) => v.referente?.nombre ?? "").filter(Boolean).join(" | "),
      coordinadores: [...new Set(activos.map((v) => v.coordinador).filter(Boolean))].join(" | "),
    };
  }
  if (tabla === "vinculos") {
    const { persona, referente, ...resto } = f as Fila & { persona: Rel; referente: Rel };
    return {
      ...resto,
      persona_nombre: persona?.nombre ?? "",
      persona_cedula: persona?.cedula ?? "",
      referente_nombre: referente?.nombre ?? "",
      referente_tipo: referente?.tipo ?? "",
    };
  }
  return f;
}

const error = (status: number, mensaje: string) =>
  Response.json({ error: mensaje }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  await connection();
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return error(401, "Inicie sesión.");
  const { data: esAdmin, error: errAdmin } = await supabase.rpc("soy_admin");
  if (errAdmin || esAdmin !== true) return error(403, "No tiene permiso para descargar la copia.");

  const tabla = new URL(req.url).searchParams.get("tabla") as Tabla | null;
  if (!tabla || !TABLAS.includes(tabla)) return error(400, "Tabla no válida.");

  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await supabase
      .from(tabla)
      .select(CONSULTA[tabla])
      .order("created_at")
      .order("id")
      .range(desde, desde + 999)
      .overrideTypes<Fila[], { merge: false }>();
    if (e) {
      console.error(`[exportar] ${tabla}:`, e.message);
      return error(500, "No se pudo leer la base. Intente de nuevo.");
    }
    filas.push(...data.map((f) => aplanar(tabla, f)));
    if (data.length < 1000) break;
  }

  const columnas = filas.length ? Object.keys(filas[0]!) : ["id"];
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // AAAA-MM-DD
  console.log(`[exportar] ${tabla}: ${filas.length} filas (usuario ${claims.claims.sub})`);

  return new Response(aCsv(columnas, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="copia-${tabla}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
