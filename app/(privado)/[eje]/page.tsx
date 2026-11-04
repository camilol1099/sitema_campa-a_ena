import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BotonNuevaPersona, BotonNuevoReferente } from "@/components/botones-acciones";
import FichaPersona from "@/components/ficha-persona";
import ListaReferentes from "@/components/lista-referentes";
import PanelReferente from "@/components/panel-referente";
import {
  cifrasEje,
  persona as cargarPersona,
  personasDeReferente,
  referente as cargarReferente,
  todosLosReferentes,
} from "@/lib/datos";
import { EJES, esSlugEje, esUuid } from "@/lib/ejes";
import { fmt } from "@/lib/formato";

// Espera los datos de la sesión antes de mostrarse (app privada, un solo usuario).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[eje]">): Promise<Metadata> {
  const { eje } = await params;
  return { title: esSlugEje(eje) ? `${EJES[eje].titulo} · Campaña Jesús Perpiñán` : "Campaña Jesús Perpiñán" };
}

export default async function PaginaEje({ params, searchParams }: PageProps<"/[eje]">) {
  // Los datos dependen de la sesión de cada visita (Supabase usa Date.now
  // para revisar si la sesión venció): esta página no se prerenderiza.
  await connection();

  const { eje } = await params;
  if (!esSlugEje(eje)) notFound();
  const conf = EJES[eje];

  const sp = await searchParams;
  const refId = esUuid(sp.referente) ? sp.referente : null;
  const perId = esUuid(sp.persona) ? sp.persona : null;

  const [referentes, cifras, ref, personasRef, per] = await Promise.all([
    todosLosReferentes(),
    cifrasEje(conf.tipo),
    refId ? cargarReferente(refId) : null,
    refId ? personasDeReferente(refId) : null,
    perId ? cargarPersona(perId) : null,
  ]);

  const delEje = referentes.filter((r) => r.tipo === conf.tipo);
  const refDelEje = ref && ref.tipo === conf.tipo ? ref : null;
  const cumplen = delEje.filter((r) => r.meta_personas && r.total_personas >= r.meta_personas).length;
  const paso = per ? 3 : refDelEje ? 2 : 1;

  const kpis = [
    { etiqueta: "Personas en este eje", valor: cifras.personas_eje, de: cifras.total_personas },
    { etiqueta: "Votan en Valledupar", valor: cifras.votan_valledupar },
    { etiqueta: "Con datos por completar", valor: cifras.por_completar },
    { etiqueta: "También en otro eje", valor: cifras.en_otro_eje },
  ];

  return (
    <main className="px-6 pt-6 pb-8 max-[859px]:p-4">
      <div className="mb-4 flex items-end justify-between gap-6 max-[859px]:flex-col max-[859px]:items-start">
        <div>
          <h1 className="text-[24px] leading-8 font-semibold tracking-[-.01em]">{conf.titulo}</h1>
          <p className="num mt-1 text-[15px] text-muted">
            <b className="font-medium text-ink">{delEje.length}</b> {conf.varios} ·{" "}
            <b className="font-medium text-ink">{fmt(cifras.personas_eje)}</b> personas
            {cumplen > 0 && (
              <>
                {" "}· <b className="font-medium text-ink">{cumplen}</b> {cumplen === 1 ? "cumple" : "cumplen"} su meta
              </>
            )}
          </p>
        </div>
        <div className="flex flex-none gap-2">
          <BotonNuevaPersona referentes={referentes} referenteInicial={refDelEje?.id} />
          <BotonNuevoReferente tipo={conf.tipo} />
        </div>
      </div>

      <section aria-label="Cifras del eje" className="mb-4 grid grid-cols-4 rounded-lg border border-border bg-surface max-[859px]:grid-cols-2">
        {kpis.map((k, i) => (
          <div
            key={k.etiqueta}
            className={`px-[18px] py-3 ${i > 0 ? "border-l border-border" : ""} max-[859px]:[&:nth-child(3)]:border-l-0 max-[859px]:[&:nth-child(n+3)]:border-t`}
          >
            <div className="text-[13px] text-muted">{k.etiqueta}</div>
            <div className="num mt-0.5 text-[24px] leading-8 font-medium">
              {fmt(k.valor)}
              {k.de !== undefined && <span className="ml-1 text-[13px] font-normal text-muted">de {fmt(k.de)}</span>}
            </div>
          </div>
        ))}
      </section>

      <section className="trabajo" data-paso={paso}>
        <div className="panel panel-lista">
          <ListaReferentes eje={eje} referentes={delEje} seleccionado={refDelEje?.id ?? null} />
        </div>
        <div className="panel panel-ref">
          <PanelReferente
            key={refDelEje?.id ?? "vacio"}
            eje={eje}
            referente={refDelEje}
            personas={personasRef ?? []}
            personaSel={perId}
            referentes={referentes}
          />
        </div>
        <div className="panel panel-ficha">
          <FichaPersona
            key={per?.persona.id ?? "vacio"}
            eje={eje}
            datos={per}
            referenteActual={refDelEje?.id ?? null}
            referentes={referentes}
          />
        </div>
      </section>
    </main>
  );
}
