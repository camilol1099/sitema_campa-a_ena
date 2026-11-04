"use client";

import Link from "next/link";
import { useState } from "react";
import { EJES, type SlugEje } from "@/lib/ejes";
import type { ReferenteResumen } from "@/lib/tipos";
import Pendiente from "./pendiente";
import { Avatar, Pildora, Vacio } from "./ui";

type Filtro = "activos" | "todos" | "inactivos";
const FILTROS: [Filtro, string][] = [
  ["activos", "Activos"],
  ["todos", "Todos"],
  ["inactivos", "Inactivos"],
];

const sinTildes = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ListaReferentes({
  eje,
  referentes,
  seleccionado,
}: {
  eje: SlugEje;
  referentes: ReferenteResumen[];
  seleccionado: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const conf = EJES[eje];

  const q = sinTildes(texto.trim());
  const lista = referentes
    .filter((r) => filtro === "todos" || (filtro === "activos") === (r.estado === "activo"))
    .filter((r) => !q || sinTildes(r.nombre).includes(q))
    .sort((a, b) => b.total_personas - a.total_personas || a.nombre.localeCompare(b.nombre));

  return (
    <>
      <div className="border-b border-rule px-4 pt-3.5 pb-2.5">
        <h2 className="text-[15px] leading-[22px] font-semibold">{conf.titulo}</h2>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Filtrar por nombre"
          aria-label={`Filtrar ${conf.varios} por nombre`}
          className="mt-2.5 h-8 w-full rounded-md border border-control bg-surface px-2.5 outline-none transition hover:border-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <div className="mt-2.5 flex gap-1.5" role="group" aria-label="Estado">
          {FILTROS.map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filtro === k}
              onClick={() => setFiltro(k)}
              className={`cursor-pointer rounded-full border px-3 py-[3px] text-[13px] transition duration-150 motion-safe:hover:-translate-y-px motion-safe:active:scale-95 ${
                filtro === k
                  ? "border-ink bg-ink text-white"
                  : "border-control bg-surface text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-cuerpo">
        {lista.length === 0 ? (
          <Vacio>No hay {conf.varios} con ese filtro.</Vacio>
        ) : (
          <ul>
            {lista.map((r) => {
              const sel = r.id === seleccionado;
              const pct = r.meta_personas ? Math.min(100, (r.total_personas / r.meta_personas) * 100) : 0;
              const extra = r.tipo === "empresario" ? r.empresa : r.tipo === "aliado" ? r.cargo_politico : null;
              return (
                <li key={r.id} className="border-b border-rule">
                  <Link
                    href={`/${eje}?referente=${r.id}`}
                    aria-current={sel ? "true" : undefined}
                    className={`relative grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition duration-150 ${
                      sel
                        ? "bg-active before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-r-sm before:bg-ink"
                        : "hover:bg-raised motion-safe:hover:pl-5"
                    }`}
                  >
                    <span className="row-span-2">
                      <Avatar id={r.id} nombre={r.nombre} />
                    </span>
                    <span className="truncate font-medium">{r.nombre}</span>
                    <span className="num row-span-2 pr-2 text-right font-medium">
                      {r.total_personas}
                      <small className="block text-[11px] font-normal text-muted">
                        {r.meta_personas ? `de ${r.meta_personas}` : "sin meta"}
                      </small>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-muted">
                      {r.estado === "inactivo" && <Pildora>Inactivo</Pildora>}
                      <span className="truncate">
                        {r.barrio ?? "Sin barrio"}
                        {extra ? `, ${extra}` : ""}
                      </span>
                    </span>
                    {r.meta_personas ? (
                      <span
                        className="col-span-2 col-start-2 mt-1.5 block h-1 overflow-hidden rounded-sm bg-rule"
                        title={`${Math.round(pct)} % de la meta`}
                      >
                        <i className="block h-full bg-hue transition-[width] duration-500" style={{ width: `${pct}%` }} />
                      </span>
                    ) : null}
                    <Pendiente />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
