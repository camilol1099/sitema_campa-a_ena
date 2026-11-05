import Link from "next/link";
import { alertasPersona } from "@/lib/alertas";
import { EJES, nombreTipo, type SlugEje } from "@/lib/ejes";
import { coordinadoresDistintos, datosFichaReferente } from "@/lib/fichas";
import { rutaPersona } from "@/lib/rutas";
import type { PersonaDeReferente, ReferenteFicha, ReferenteResumen } from "@/lib/tipos";
import { BotonEditarReferente, BotonVincularPersona } from "./botones-acciones";
import Pendiente from "./pendiente";
import { Avatar, Guion, IconoVolver, Pildora, Vacio, claseBoton } from "./ui";

export default function PanelReferente({
  eje,
  referente: r,
  personas,
  personaSel,
  referentes,
}: {
  eje: SlugEje;
  referente: ReferenteFicha | null;
  personas: PersonaDeReferente[];
  personaSel: string | null;
  referentes: ReferenteResumen[];
}) {
  if (!r) {
    return (
      <div className="panel-cuerpo">
        <Vacio>Elija un referente para ver sus personas.</Vacio>
      </div>
    );
  }

  const n = personas.length;
  const coordinadores = coordinadoresDistintos(personas);
  // Datos según el eje. Nunca dirección ni teléfono.
  const datos = datosFichaReferente(r, coordinadores);

  return (
    <div className="panel-cuerpo aparecer">
      <Link href={`/${eje}`} className={`${claseBoton("sec", "sm")} solo-movil mx-3 mt-3`}>
        <IconoVolver /> Volver a {EJES[eje].varios}
      </Link>

      {/* Ficha corta: tarjeta blanca en relieve */}
      <div className="m-3 rounded-[20px] bg-white/70 p-[18px] shadow-neu-out-sm">
        <div className="flex items-center gap-3.5">
          <Avatar id={r.id} nombre={r.nombre} tamano={54} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[19px] leading-[26px] font-bold tracking-[-.01em]">{r.nombre}</h2>
            <p className="text-muted">
              {nombreTipo(r.tipo)}
              {r.tipo !== "lider" && r.barrio ? `, ${r.barrio}` : ""}
            </p>
          </div>
          <BotonEditarReferente id={r.id} tipo={r.tipo} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2.5 max-[859px]:grid-cols-2">
          {datos.map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-ctl bg-neu px-3 py-2.5 shadow-neu-in">
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className="truncate font-semibold" title={k === "Coordinadores" ? coordinadores.join(", ") : undefined}>
                {v ?? <Guion />}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex justify-between text-[13px]">
          <span>Personas vinculadas</span>
          <b className="num font-bold">{n}</b>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2.5 px-[18px] py-2">
        <h3 className="text-[15px] font-bold">Sus personas</h3>
        <BotonVincularPersona referenteId={r.id} referenteNombre={r.nombre} referentes={referentes} />
      </div>

      {n === 0 ? (
        <Vacio>Aún no tiene personas vinculadas.</Vacio>
      ) : (
        <ul className="arbol">
          {personas.map((p) => {
            const sel = p.id === personaSel;
            return (
              <li key={p.id}>
                <Link
                  href={rutaPersona(p.id, r)}
                  aria-current={sel ? "true" : undefined}
                  className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 rounded-ctl px-3 py-[9px] transition duration-150 ${
                    sel ? "bg-white shadow-neu-out-sm" : "hover:bg-white/65"
                  }`}
                >
                  <span className="truncate font-semibold">{p.nombre}</span>
                  <span className="row-span-2 flex max-w-[190px] flex-wrap items-center justify-end gap-1 pr-2">
                    {alertasPersona(p)
                      .slice(0, 2)
                      .map((a) => (
                        <Pildora key={a.texto} tono={a.tono}>
                          {a.texto}
                        </Pildora>
                      ))}
                  </span>
                  <span className="truncate text-[13px] text-muted">
                    {p.barrio ?? "Sin barrio"}
                    {p.puesto_votacion ? `, ${p.puesto_votacion}` : ""}
                  </span>
                  <Pendiente />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
