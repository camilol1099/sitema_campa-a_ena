import type { Metadata } from "next";
import { connection } from "next/server";
import PanelRevision from "@/components/revision";
import { revision, todosLosReferentes } from "@/lib/datos";
import { fmt } from "@/lib/formato";

export const metadata: Metadata = { title: "Revisión · Campaña Jesús Perpiñán" };

// Espera los datos de la sesión antes de mostrarse (app privada, un solo usuario).
export const instant = false;

export default async function PaginaRevision() {
  // Datos de cada visita (dependen de la sesión): no se prerenderiza.
  await connection();
  const [datos, referentes] = await Promise.all([revision(), todosLosReferentes()]);
  const total = datos.sinLider.length + datos.cedulaInvalida.length + datos.repetidaExcel.length;

  return (
    <main className="px-[18px] pt-[26px] pb-9 max-[859px]:px-2 max-[859px]:pt-[18px]">
      <div className="mx-1.5 mb-(--gap)">
        <h1 className="text-[30px] leading-[38px] font-bold tracking-[-.02em] max-[859px]:text-[24px] max-[859px]:leading-8">Revisión</h1>
        <p className="num mt-1.5 text-[15px] leading-[23px] text-muted">
          {total === 0 ? (
            "No hay personas pendientes de revisar."
          ) : (
            <>
              <b className="font-semibold text-ink">{fmt(total)} personas</b> necesitan que usted decida algo. Corríjalas aquí y quedan guardadas.
            </>
          )}
        </p>
      </div>
      <PanelRevision datos={datos} referentes={referentes} />
    </main>
  );
}
