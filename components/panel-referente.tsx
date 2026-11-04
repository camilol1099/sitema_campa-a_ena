import Link from "next/link";
import { alertasPersona } from "@/lib/alertas";
import { EJES, nombreTipo, type SlugEje } from "@/lib/ejes";
import { coordinadoresDistintos, datosFichaReferente, porcentajeMeta } from "@/lib/fichas";
import { rutaPersona } from "@/lib/rutas";
import type { PersonaDeReferente, ReferenteFicha, ReferenteResumen } from "@/lib/tipos";
import { BotonEditarReferente, BotonVincularPersona } from "./botones-acciones";
import Pendiente from "./pendiente";
import { Avatar, Guion, IconoVolver, Pildora, Vacio, boton } from "./ui";

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
  // Tres datos según el eje. Nunca dirección ni teléfono.
  const datos = datosFichaReferente(r, coordinadores);

  return (
    <div className="panel-cuerpo aparecer">
      <div className="border-b border-rule px-[18px] py-4">
        <Link href={`/${eje}`} className={`${boton.secundarioSm} solo-movil mb-3`}>
          <IconoVolver /> {EJES[eje].titulo}
        </Link>
        <div className="flex items-center gap-3.5">
          <Avatar id={r.id} nombre={r.nombre} tamano={48} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] leading-[26px] font-semibold">{r.nombre}</h2>
            <p className="flex items-center gap-1.5 text-muted">
              {nombreTipo(r.tipo)}
              {r.tipo !== "lider" && r.barrio ? `, ${r.barrio}` : ""}
              {r.estado === "inactivo" && <Pildora>Inactivo</Pildora>}
            </p>
          </div>
          <BotonEditarReferente id={r.id} tipo={r.tipo} />
        </div>

        <dl className="mt-3.5 grid grid-cols-3 gap-x-4 gap-y-3 max-[859px]:grid-cols-2">
          {datos.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[13px] text-muted">{k}</dt>
              <dd className="truncate font-medium" title={k === "Coordinadores" ? coordinadores.join(", ") : undefined}>
                {v ?? <Guion />}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3.5">
          <div className="flex justify-between text-[13px]">
            <span>Personas vinculadas</span>
            <span className="num">
              <b className="font-medium">{n}</b>
              {r.meta_personas ? ` de una meta de ${r.meta_personas}` : " (sin meta)"}
            </span>
          </div>
          {r.meta_personas ? (
            <div className="mt-1.5 h-2 overflow-hidden rounded bg-rule">
              <i
                className="block h-full rounded bg-hue transition-[width] duration-500"
                style={{ width: `${porcentajeMeta(n, r.meta_personas)}%` }}
              />
            </div>
          ) : null}
        </div>

        {r.notas && <div className="mt-3 rounded-md bg-raised px-2.5 py-2 text-[13px] text-muted">{r.notas}</div>}
      </div>

      <div className="flex items-center justify-between gap-2.5 px-[18px] pt-3 pb-1.5">
        <h3 className="font-semibold">Sus personas</h3>
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
                  className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 rounded-md border px-2.5 py-2 transition duration-150 ${
                    sel ? "border-control bg-active" : "border-transparent hover:border-rule hover:bg-raised motion-safe:hover:translate-x-0.5"
                  }`}
                >
                  <span className="truncate font-medium">{p.nombre}</span>
                  <span className="row-span-2 flex max-w-[180px] flex-wrap items-center justify-end gap-1 pr-2">
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
