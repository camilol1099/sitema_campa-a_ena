import Link from "next/link";
import type { ReactNode } from "react";
import { nombreTipo, type SlugEje } from "@/lib/ejes";
import { describirCambio } from "@/lib/historial";
import { rutaPersona } from "@/lib/rutas";
import { fecha, fechaConHora } from "@/lib/formato";
import type { EventoHistorial, Persona, ReferenteResumen, VinculoDePersona } from "@/lib/tipos";
import { BotonEditarPersona, BotonEliminarPersona, BotonVincularAReferente } from "./botones-acciones";
import { Guion, IconoVolver, Pildora, Vacio, claseBoton } from "./ui";

// Bloque en tarjeta blanca en relieve, con título en mayúsculas pequeñas.
function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mx-3.5 mt-3 rounded-card bg-white/70 px-4 py-3.5 shadow-neu-out-sm">
      <h3 className="mb-2 text-[12px] font-bold tracking-[.06em] text-muted uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

function Campos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 font-medium break-words">{v ?? <Guion />}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function FichaPersona({
  eje,
  datos,
  referenteActual,
  referentes,
}: {
  eje: SlugEje;
  datos: { persona: Persona; vinculos: VinculoDePersona[]; historial: EventoHistorial[] } | null;
  referenteActual: string | null;
  referentes: ReferenteResumen[];
}) {
  if (!datos) {
    return (
      <div className="panel-cuerpo">
        <Vacio>Elija una persona para ver toda su información.</Vacio>
      </div>
    );
  }
  const { persona: p, vinculos, historial } = datos;
  const nombres = new Map(referentes.map((r) => [r.id, r.nombre]));
  const volver = referenteActual ? `/${eje}?referente=${referenteActual}` : `/${eje}`;

  return (
    <div className="panel-cuerpo aparecer pb-4">
      {/* Cabecera con un leve degradado verde */}
      <div className="bg-[linear-gradient(160deg,rgba(72,167,51,.16),rgba(255,255,255,0)_70%)] px-5 pt-5 pb-4">
        <Link href={volver} className={`${claseBoton("sec", "sm")} solo-movil mb-3`}>
          <IconoVolver /> Volver
        </Link>
        <h2 className="text-[20px] leading-7 font-bold tracking-[-.01em]">{p.nombre}</h2>
        <p className="num mt-0.5 text-[13px] text-muted">{p.cedula ? `Cédula ${p.cedula}` : "Sin cédula registrada"}</p>
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <BotonEditarPersona persona={p} />
          <BotonVincularAReferente personaId={p.id} vinculos={vinculos} referentes={referentes} />
          <BotonEliminarPersona id={p.id} nombre={p.nombre} volver={volver} />
        </div>
      </div>

      {vinculos.length > 1 && (
        <div className="mx-3.5 mt-3 rounded-ctl bg-note px-3 py-2.5 text-[13px] text-note-ink">
          Está con {vinculos.length} referentes. Confirme si es correcto.
        </div>
      )}

      <Bloque titulo="Datos personales">
        <Campos
          filas={[
            ["Cédula", p.cedula && <span className="num">{p.cedula}</span>],
            ["Celular", p.celular && <span className="num">{p.celular}</span>],
            ["Dirección", p.direccion],
            ["Barrio", p.barrio],
          ]}
        />
      </Bloque>

      <Bloque titulo="Votación">
        <Campos
          filas={[
            [
              "Verificación",
              !p.municipio_verificacion ? (
                <Pildora>Sin verificar</Pildora>
              ) : p.municipio_verificacion === "Valledupar" ? (
                "Vota en Valledupar"
              ) : (
                <Pildora tono="aviso">{p.municipio_verificacion}</Pildora>
              ),
            ],
            ["Puesto", p.puesto_votacion],
            ["Mesa", p.mesa && <span className="num">{p.mesa}</span>],
          ]}
        />
      </Bloque>

      <Bloque titulo="Referentes">
        {vinculos.length === 0 ? (
          <p className="text-muted">Sin referente.</p>
        ) : (
          <ul>
            {vinculos.map((v) => (
              <li key={v.id} className="border-t border-linea first:border-t-0">
                <Link
                  href={rutaPersona(p.id, v.referente)}
                  className="-mx-2 flex justify-between gap-2.5 rounded-[12px] px-2 py-[9px] text-[13.5px] transition hover:bg-white/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{v.referente.nombre}</span>
                    <span className="block text-[13px] text-muted">
                      {nombreTipo(v.referente.tipo)}
                      {v.coordinador ? `, coordina ${v.coordinador}` : ""}
                    </span>
                  </span>
                  <span className="num flex-none text-[13px] text-muted">desde el {fecha(v.fecha_vinculo)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="Autorización y notas">
        <Campos
          filas={[
            [
              "Datos personales",
              p.autorizacion_datos ? (
                `Autorizó${p.fecha_autorizacion ? ` el ${fecha(p.fecha_autorizacion)}` : ""}`
              ) : (
                <Pildora tono="aviso">Sin autorización</Pildora>
              ),
            ],
            ["Observaciones", p.observaciones],
          ]}
        />
      </Bloque>

      <Bloque titulo="Historial">
        {historial.length === 0 ? (
          <p className="text-[13px] text-muted">Sin cambios registrados todavía.</p>
        ) : (
          <ul className="text-[13px]">
            {historial.map((e) => (
              <li key={e.id} className="grid grid-cols-[86px_minmax(0,1fr)] gap-2.5 border-t border-linea py-[7px] first:border-t-0">
                <time className="num text-muted" dateTime={e.fecha}>
                  {fechaConHora(e.fecha)}
                </time>
                <span>{describirCambio(e, nombres)}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    </div>
  );
}
