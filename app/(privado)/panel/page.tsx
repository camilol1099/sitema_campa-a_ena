import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { BarraAvance, Pildora, Vacio, Vidrio } from "@/components/ui";
import { panelBarrios, panelCalidad, panelReferentes, panelTotales } from "@/lib/datos";
import { EJES, nombreTipo, slugDeTipo } from "@/lib/ejes";
import { fmt } from "@/lib/formato";
import { CUANTOS_REFERENTES, anchoBarra, conMenos, mejores, rankingBarrios } from "@/lib/panel";
import { rutaReferente } from "@/lib/rutas";
import type { PanelBarrio, PanelReferente, PanelTotal } from "@/lib/tipos";

export const metadata: Metadata = { title: "Panel · Campaña Jesús Perpiñán" };

// Espera los datos de la sesión antes de mostrarse (app privada, un solo usuario).
export const instant = false;

export default async function PaginaPanel() {
  // Datos de cada visita (dependen de la sesión): no se prerenderiza.
  await connection();

  const [totales, referentes, barrios, calidad] = await Promise.all([
    panelTotales(),
    panelReferentes(),
    panelBarrios(),
    panelCalidad(),
  ]);

  const totalPersonas = barrios.reduce((s, b) => s + b.personas, 0);
  const top = mejores(referentes);
  const menos = conMenos(referentes);
  // Las barras se miden contra el que más personas tiene.
  const maxRef = Math.max(1, top[0]?.total_personas ?? 0);
  const rb = rankingBarrios(barrios);
  const maxBarrio = rb.mas[0]?.personas ?? 1;

  return (
    <main className="px-[18px] pt-[26px] pb-9 max-[859px]:px-2 max-[859px]:pt-[18px]">
      <div className="mx-1.5 mb-(--gap)">
        <h1 className="text-[30px] leading-[38px] font-bold tracking-[-.02em] max-[859px]:text-[24px] max-[859px]:leading-8">
          Panel de avance
        </h1>
        <p className="num mt-1.5 text-[15px] leading-[23px] text-muted">
          <b className="font-semibold text-ink">{fmt(totalPersonas)} personas</b> registradas y {fmt(referentes.length)} referentes.
        </p>
      </div>

      {/* 1. Tarjetas por eje (llevan al eje) */}
      <section aria-label="Avance por eje" className="mb-(--gap) grid grid-cols-3 gap-(--gap) max-[859px]:grid-cols-1 max-[859px]:gap-3">
        {totales.map((t) => (
          <TarjetaEje key={t.tipo} t={t} />
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-(--gap) max-[1280px]:grid-cols-1">
        {/* 2. Mejores referentes */}
        <Caja titulo="Mejores referentes" sub={`Los ${CUANTOS_REFERENTES} que más personas han traído.`}>
          {top.length === 0 ? <Vacio>Todavía no hay referentes.</Vacio> : <FilasReferentes refs={top} max={maxRef} />}
        </Caja>

        {/* 3. Los que menos personas tienen */}
        <Caja titulo="Con menos personas" sub={`Los ${CUANTOS_REFERENTES} referentes que menos personas han traído.`}>
          {menos.length === 0 ? (
            <Vacio>No hay más referentes para mostrar.</Vacio>
          ) : (
            <FilasReferentes refs={menos} max={maxRef} />
          )}
        </Caja>

        {/* 4. Barrios */}
        <Caja
          titulo="Barrios"
          sub={
            rb.sinBarrio > 0
              ? `${fmt(rb.sinBarrio)} ${rb.sinBarrio === 1 ? "persona aún" : "personas aún"} sin barrio.`
              : "Personas por barrio."
          }
        >
          {rb.total === 0 ? (
            <Vacio>{totalPersonas === 0 ? "Todavía no hay personas registradas." : "Ninguna persona tiene barrio todavía."}</Vacio>
          ) : (
            <>
              <ListaBarrios titulo="Con más personas" barrios={rb.mas} max={maxBarrio} />
              {rb.menos.length > 0 && <ListaBarrios titulo="Con menos personas" barrios={rb.menos} max={maxBarrio} />}
            </>
          )}
        </Caja>

        {/* 5. Calidad de datos */}
        <Caja titulo="Calidad de datos" sub="Registros que conviene completar.">
          <div className="grid grid-cols-3 gap-3 max-[859px]:grid-cols-2">
            {(
              [
                [calidad.sin_cedula, "sin cédula"],
                [calidad.sin_barrio, "sin barrio"],
                [calidad.sin_puesto, "sin puesto de votación"],
                [calidad.sin_verificar, "sin verificar municipio"],
                [calidad.sin_vinculo, "sin ningún referente"],
                [calidad.varios_referentes, "con 2 o más referentes"],
              ] as const
            ).map(([n, t]) => (
              <div key={t} className="rounded-[16px] bg-neu p-3.5 shadow-neu-out-sm">
                <b className="num block text-[24px] leading-[30px] font-extrabold">{fmt(n)}</b>
                <span className="text-[12.5px] text-muted">{t}</span>
              </div>
            ))}
          </div>
        </Caja>
      </div>
    </main>
  );
}

function TarjetaEje({ t }: { t: PanelTotal }) {
  const slug = slugDeTipo(t.tipo);
  const eje = EJES[slug];
  return (
    <Vidrio
      como={Link}
      href={`/${slug}`}
      className="block rounded-pane px-[22px] py-5 transition duration-150 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">{eje.titulo}</h2>
        <Pildora>
          {fmt(t.referentes)} {t.referentes === 1 ? eje.uno : eje.varios}
        </Pildora>
      </div>
      <div className="num mt-3.5 mb-0.5 text-[40px] leading-[46px] font-extrabold tracking-[-.03em]">{fmt(t.personas)}</div>
      <div className="text-[13px] text-muted">personas</div>
    </Vidrio>
  );
}

function FilasReferentes({ refs, max }: { refs: PanelReferente[]; max: number }) {
  return (
    <ul>
      {refs.map((r) => (
        <li key={r.id}>
          <Link
            href={rutaReferente(r.tipo, r.id)}
            className="grid grid-cols-[minmax(0,1fr)_130px_56px] items-center gap-3.5 rounded-ctl px-3 py-2.5 transition duration-150 hover:bg-white/70 hover:shadow-neu-out-sm max-[859px]:grid-cols-[minmax(0,1fr)_80px_48px]"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{r.nombre}</span>
              <span className="block text-[12px] text-muted">{nombreTipo(r.tipo)}</span>
            </span>
            <BarraAvance pct={anchoBarra((r.total_personas / max) * 100)} fina />
            <span className="num text-right font-bold">{fmt(r.total_personas)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListaBarrios({ titulo, barrios, max }: { titulo: string; barrios: PanelBarrio[]; max: number }) {
  return (
    <div className="mt-1 mb-3 last:mb-0">
      <h3 className="mb-1 text-[12px] font-bold tracking-[.06em] text-muted uppercase">{titulo}</h3>
      <ul>
        {barrios.map((b) => (
          <li
            key={b.barrio}
            className="grid grid-cols-[130px_minmax(0,1fr)_40px] items-center gap-3 py-[5px] text-[13px] max-[859px]:grid-cols-[100px_minmax(0,1fr)_34px]"
          >
            <span className="truncate" title={b.barrio}>
              {b.barrio}
            </span>
            <BarraAvance pct={anchoBarra((b.personas / max) * 100)} fina />
            <span className="num text-right font-semibold">{fmt(b.personas)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Caja({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return (
    <Vidrio como="section" fuerte className="rounded-pane px-[22px] py-5">
      <h2 className="mb-1 text-[16px] font-bold">{titulo}</h2>
      <p className="mb-3.5 text-[13px] text-muted">{sub}</p>
      {children}
    </Vidrio>
  );
}
