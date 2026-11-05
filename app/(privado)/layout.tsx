import { redirect } from "next/navigation";
import { connection } from "next/server";
import BarraSuperior from "@/components/barra-superior";
import { CatalogosProvider } from "@/components/catalogo";
import { ToastProvider } from "@/components/toast";
import { catalogos as cargarCatalogos, todosLosReferentes } from "@/lib/datos";
import { SLUGS, slugDeTipo, type SlugEje } from "@/lib/ejes";
import { crearClienteServidor } from "@/lib/supabase/server";

// La ruta espera a verificar la sesión antes de mostrarse (app privada, un solo usuario).
export const instant = false;

// Segunda verificación en el servidor (además del proxy).
// Aun así, quien protege los datos es RLS en Supabase.
export default async function LayoutPrivado({ children }: LayoutProps<"/">) {
  // Marca esta parte como "de cada visita": Supabase usa la hora actual
  // (Date.now) para revisar si la sesión venció.
  await connection();

  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const [referentes, catalogos] = await Promise.all([todosLosReferentes(), cargarCatalogos()]);
  const conteos = Object.fromEntries(SLUGS.map((s) => [s, 0])) as Record<SlugEje, number>;
  for (const r of referentes) conteos[slugDeTipo(r.tipo)]++;

  return (
    <ToastProvider>
      <CatalogosProvider valor={catalogos}>
        <BarraSuperior conteos={conteos} correo={String(data.claims.email ?? "")} />
        {children}
      </CatalogosProvider>
    </ToastProvider>
  );
}
