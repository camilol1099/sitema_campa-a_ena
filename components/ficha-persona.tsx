import Link from "next/link";
import type { ReactNode } from "react";
import { nombreTipo, slugDeTipo, type SlugEje } from "@/lib/ejes";
import { fecha, fechaConHora } from "@/lib/formato";
import type { EventoHistorial, Persona, ReferenteResumen, VinculoDePersona } from "@/lib/tipos";
import { BotonEditarPersona, BotonVincularAReferente } from "./botones-acciones";
import { Guion, IconoVolver, Pildora, Vacio, boton } from "./ui";

const ETIQUETAS: Record<string, string> = {
  nombre: "nombre",
  cedula: "cédula",
  celular: "celular",
  direccion: "dirección",
  barrio: "barrio",
  municipio_verificacion: "verificación",
  puesto_votacion: "puesto",
  mesa: "mesa",
  observaciones: "observaciones",
  autorizacion_datos: "autorización",
  fecha_autorizacion: "fecha de autorización",
  coordinador: "coordinador",
  activo: "estado del vínculo",
  nota: "nota",
  fecha_vinculo: "fecha del vínculo",
};
const IGNORAR = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

// Texto corto de cada cambio del historial.
function describir(e: EventoHistorial, nombres: Map<string, string>) {
  const antes = e.cambios?.antes ?? {};
  const despues = e.cambios?.despues ?? {};
  const refId = String(despues.referente_id ?? antes.referente_id ?? "");
  const ref = nombres.get(refId) ?? "un referente";

  if (e.tabla === "vinculos") {
    if (e.accion === "vincular") return `Se vinculó a ${ref}`;
    if (e.accion === "desvincular") return `Se desvinculó de ${ref}`;
    if (antes.activo === false && despues.activo === true) return `Se volvió a vincular a ${ref}`;
  } else if (e.accion === "crear") {
    return "Registro creado";
  }
  const campos = Object.keys(despues)
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => ETIQUETAS[k] ?? k);
  const que = campos.length ? `: ${campos.join(", ")}` : "";
  return e.tabla === "vinculos" ? `Se editó el vínculo con ${ref}${que}` : `Se editó${que}`;
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[13px] font-semibold text-muted">{titulo}</h3>
      {children}
    </section>
  );
}

function Campos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-3 gap-y-[7px] text-[13.5px]">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? <Guion />}</dd>
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
    <div className="panel-cuerpo aparecer">
      <div className="border-b border-rule px-[18px] py-4">
        <Link href={volver} className={`${boton.secundarioSm} solo-movil mb-3`}>
          <IconoVolver /> Volver
        </Link>
        <h2 className="text-[18px] leading-[26px] font-semibold">{p.nombre}</h2>
        <p className="num mt-0.5 text-[13px] text-muted">{p.cedula ? `Cédula ${p.cedula}` : "Sin cédula registrada"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <BotonEditarPersona persona={p} />
          <BotonVincularAReferente personaId={p.id} vinculos={vinculos} referentes={referentes} />
        </div>
      </div>

      <div className="px-[18px] pt-0.5 pb-[18px]">
        {vinculos.length > 1 && (
          <div className="mt-3 rounded-md border border-note-ink/20 bg-note px-3 py-2 text-[13px] text-note-ink">
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
                <li key={v.id} className="border-t border-rule first:border-t-0">
                  <Link
                    href={`/${slugDeTipo(v.referente.tipo)}?referente=${v.referente.id}&persona=${p.id}`}
                    className="-mx-2 flex justify-between gap-2.5 rounded-md px-2 py-2 text-[13.5px] transition hover:bg-raised"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{v.referente.nombre}</span>
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
                <li key={e.id} className="grid grid-cols-[86px_minmax(0,1fr)] gap-2.5 border-t border-rule py-1.5 first:border-t-0">
                  <time className="num text-muted" dateTime={e.fecha}>
                    {fechaConHora(e.fecha)}
                  </time>
                  <span>{describir(e, nombres)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  );
}
