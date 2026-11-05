import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BotonNuevaPersona, BotonNuevoReferente } from "@/components/botones-acciones";
import FichaPersona from "@/components/ficha-persona";
import ListaReferentes from "@/components/lista-referentes";
import PanelReferente from "@/components/panel-referente";
import { IconoAlerta, IconoCheck, IconoCruce, IconoPersonas, Vidrio } from "@/components/ui";
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
  const paso = per ? 3 : refDelEje ? 2 : 1;

  // El que más personas aporta (para la frase con el hallazgo).
  const top = delEje.reduce<(typeof delEje)[number] | null>(
    (m, r) => (r.total_personas > (m?.total_personas ?? 0) ? r : m),
    null,
  );

  const kpis = [
    { etiqueta: "Personas en este eje", valor: cifras.personas_eje, nota: `de ${fmt(cifras.total_personas)} registradas`, icono: <IconoPersonas /> },
    { etiqueta: "Votan en Valledupar", valor: cifras.votan_valledupar, nota: "verificadas en el censo", icono: <IconoCheck /> },
    { etiqueta: "Datos por completar", valor: cifras.por_completar, nota: "sin cédula, barrio o verificación", icono: <IconoAlerta /> },
    { etiqueta: "También en otro eje", valor: cifras.en_otro_eje, nota: "tienen referente en otro eje", icono: <IconoCruce /> },
  ];

  return (
    <main className="px-[18px] pt-[26px] pb-9 max-[859px]:px-2 max-[859px]:pt-[18px]">
      <div className="mx-1.5 mb-(--gap) flex items-end justify-between gap-6 max-[859px]:mb-3.5 max-[859px]:flex-col max-[859px]:items-start">
        <div>
          <h1 className="text-[30px] leading-[38px] font-bold tracking-[-.02em] max-[859px]:text-[24px] max-[859px]:leading-8">{conf.titulo}</h1>
          <p className="num mt-1.5 max-w-[72ch] text-[15px] leading-[23px] text-muted">
            <b className="font-semibold text-ink">
              {delEje.length} {delEje.length === 1 ? conf.uno : conf.varios} {delEje.length === 1 ? "reúne" : "reúnen"} {fmt(cifras.personas_eje)} personas.
            </b>{" "}
            {top && `${top.nombre} es quien más aporta, con ${fmt(top.total_personas)}.`}
          </p>
        </div>
        <div className="flex flex-none gap-2.5">
          <BotonNuevaPersona referentes={referentes} referenteInicial={refDelEje?.id} />
          <BotonNuevoReferente tipo={conf.tipo} />
        </div>
      </div>

      <section aria-label="Cifras del eje" className="mb-(--gap) grid grid-cols-4 gap-(--gap) max-[1280px]:grid-cols-2 max-[859px]:gap-2.5">
        {kpis.map((k) => (
          <Vidrio key={k.etiqueta} className="relative overflow-hidden rounded-card px-[18px] py-4">
            <span className="absolute top-4 right-4 flex h-[34px] w-[34px] items-center justify-center rounded-[12px] bg-neu text-brand shadow-neu-out-sm">
              {k.icono}
            </span>
            <div className="pr-10 text-[13px] font-medium text-muted">{k.etiqueta}</div>
            <div className="num mt-1 text-[30px] leading-[38px] font-bold tracking-[-.02em] max-[859px]:text-[24px]">{fmt(k.valor)}</div>
            <div className="text-[13px] text-muted">{k.nota}</div>
          </Vidrio>
        ))}
      </section>

      <section className="trabajo" data-paso={paso}>
        <Vidrio fuerte className="panel panel-lista rounded-pane">
          <ListaReferentes eje={eje} referentes={delEje} seleccionado={refDelEje?.id ?? null} />
        </Vidrio>
        <Vidrio fuerte className="panel panel-ref rounded-pane">
          <PanelReferente
            key={refDelEje?.id ?? "vacio"}
            eje={eje}
            referente={refDelEje}
            personas={personasRef ?? []}
            personaSel={perId}
            referentes={referentes}
          />
        </Vidrio>
        <Vidrio fuerte className="panel panel-ficha rounded-pane">
          <FichaPersona
            key={per?.persona.id ?? "vacio"}
            eje={eje}
            datos={per}
            referenteActual={refDelEje?.id ?? null}
            referentes={referentes}
          />
        </Vidrio>
      </section>
    </main>
  );
}
