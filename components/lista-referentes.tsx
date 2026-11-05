"use client";

import Link from "next/link";
import { useState } from "react";
import { Texto } from "./campos";
import { EJES, type SlugEje } from "@/lib/ejes";
import { filtrarReferentes } from "@/lib/filtros";
import type { ReferenteResumen } from "@/lib/tipos";
import Pendiente from "./pendiente";
import { Avatar, Vacio } from "./ui";

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
  const conf = EJES[eje];

  const lista = filtrarReferentes(referentes, texto);

  return (
    <>
      <div className="px-[18px] pt-[18px] pb-3">
        <h2 className="text-[16px] leading-[22px] font-bold">{conf.titulo}</h2>
        <p className="text-[13px] text-muted">Ordenados por personas vinculadas</p>
        <Texto
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Filtrar por nombre o cédula"
          aria-label={`Filtrar ${conf.varios} por nombre o cédula`}
          className="mt-3 h-[38px]"
        />
      </div>

      <div className="panel-cuerpo">
        {lista.length === 0 ? (
          <Vacio>No hay {conf.varios} con ese nombre o cédula.</Vacio>
        ) : (
          <ul className="pb-2">
            {lista.map((r) => {
              const sel = r.id === seleccionado;
              const extra = r.tipo === "empresario" ? r.empresa : r.tipo === "aliado" ? r.zona_influencia : null;
              return (
                <li key={r.id} className="mx-2.5 mb-1.5">
                  <Link
                    href={`/${eje}?referente=${r.id}`}
                    aria-current={sel ? "true" : undefined}
                    className={`relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[16px] px-3.5 py-3 transition duration-150 ${
                      sel
                        ? "bg-white shadow-neu-out-sm before:absolute before:top-3.5 before:bottom-3.5 before:-left-px before:w-1 before:rounded before:bg-grad"
                        : "hover:bg-white/60"
                    }`}
                  >
                    <span className="row-span-2">
                      <Avatar id={r.id} nombre={r.nombre} />
                    </span>
                    <span className="truncate font-semibold">{r.nombre}</span>
                    <span className="num row-span-2 pr-2 text-right text-[15px] font-bold">
                      {r.total_personas}
                      <small className="block text-[12px] font-normal text-muted">
                        {r.total_personas === 1 ? "persona" : "personas"}
                      </small>
                    </span>
                    <span className="truncate text-[13px] text-muted">
                      {r.barrio ?? "Sin barrio"}
                      {extra ? `, ${extra}` : ""}
                    </span>
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
