"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { guardarPersona, guardarReferente, vincularPersona, type Resultado } from "@/app/(privado)/acciones";
import {
  confirmarImportacion,
  deshacerLote,
  previsualizarImportacion,
  type ResultadoDeshacer,
  type Vista,
} from "@/app/(privado)/importacion";
import { encabezadosPorHoja, leerArchivo, MAX_FILAS, resumenArchivo, type Libro } from "@/lib/asistente/archivo";
import type { Borrador, Evento, MensajeChat } from "@/lib/asistente/tipos";
import { SUFIJO_NUEVO } from "@/lib/catalogos";
import { nombreTipo } from "@/lib/ejes";
import {
  detectarFormatoCampana,
  filasCampana,
  type EntradaImportacion,
  type FilaPlan,
  type FiltroCampana,
  type Resolucion,
} from "@/lib/campana";
import { aplicarMapeo, revisarMapeo, type FilaMapeada, type Mapeo } from "@/lib/importacion";

// Asistente de IA: panel lateral de vidrio con el chat (diseño: asistente-referencia.html).
// - La conversación vive solo en memoria (se pierde al recargar).
// - El archivo adjunto se lee aquí, en el navegador; al servidor solo va el
//   resumen y, al importar, las filas ya mapeadas (que el servidor revalida).
// - Nada se guarda sin que la usuaria toque "Confirmar".

const NOMBRE_TIPO = { persona: "personas", lider: "líderes", empresario: "empresarios", aliado: "aliados" } as const;

type Adjunto = { nombre: string; hojas: number; filas: number };

type Item =
  | { id: number; clase: "mensaje"; rol: "user" | "assistant"; texto: string; adjunto?: Adjunto; error?: boolean }
  | { id: number; clase: "nota"; texto: string }
  | { id: number; clase: "borrador"; borrador: Borrador }
  | { id: number; clase: "importacion"; fuente: FuenteImportacion; archivo: string };

// Item sin id (Omit que se reparte en cada variante).
type NuevoItem = Item extends infer T ? (T extends Item ? Omit<T, "id"> : never) : never;

// true solo en el navegador (para montar el portal después de hidratar).
const sinSuscripcion = () => () => {};
const useEnNavegador = () => useSyncExternalStore(sinSuscripcion, () => true, () => false);

let siguienteId = 1;
const nuevoId = () => siguienteId++;

const hora = (d: Date) => new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(d);
const fechaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(d);

const SUGERENCIAS: { icono: string; texto: string; detalle: string }[] = [
  { icono: "#", texto: "¿Cuántas personas tiene cada líder?", detalle: "Resumen por líder" },
  { icono: "!", texto: "Personas sin puesto de votación", detalle: "Agrupadas por líder" },
  { icono: "?", texto: "Buscar por cédula o nombre", detalle: "Ej.: ¿quién tiene la cédula 1065…?" },
  { icono: "+", texto: "Cargar un Excel", detalle: "Muestra una vista previa antes de guardar" },
];

// ---------------------------------------------------------------------------
// Íconos
// ---------------------------------------------------------------------------
const svg = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, viewBox: "0 0 24 24" };
const IconoChispa = ({ tam = 18, conBrillo = true }: { tam?: number; conBrillo?: boolean }) => (
  <svg {...svg} width={tam} height={tam} strokeWidth={1.9}>
    <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z" />
    {conBrillo && <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />}
  </svg>
);
const IconoNueva = () => (
  <svg {...svg} width={18} height={18} strokeWidth={1.8}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconoAmpliar = () => (
  <svg {...svg} width={18} height={18} strokeWidth={1.8}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
const IconoReducir = () => (
  <svg {...svg} width={18} height={18} strokeWidth={1.8}>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </svg>
);
const IconoCerrar = () => (
  <svg {...svg} width={18} height={18} strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const IconoClip = () => (
  <svg {...svg} width={18} height={18} strokeWidth={1.8}>
    <path d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10 17.3a1.7 1.7 0 0 1-2.3-2.4L15.6 7" />
  </svg>
);
const IconoEnviar = () => (
  <svg {...svg} width={18} height={18} strokeWidth={2.2}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const IconoEscudo = () => (
  <svg {...svg} width={16} height={16} strokeWidth={1.8} className="mt-px flex-none">
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------
const claseIcono =
  "flex h-9 w-[34px] flex-none cursor-pointer items-center justify-center rounded-[12px] text-muted transition hover:bg-neu hover:text-ink hover:shadow-neu-out-sm";
const claseBtn = "inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-[12px] px-4 font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60";
const btnPri = `${claseBtn} bg-grad text-white shadow-boton hover:brightness-107`;
const btnSec = `${claseBtn} bg-neu shadow-neu-out-sm hover:text-brand active:shadow-neu-in`;

// Negritas **así** (nada de HTML del modelo).
function Negritas({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith("**") && parte.endsWith("**") && parte.length > 4 ? (
          <b key={i} className="font-semibold">
            {parte.slice(2, -2)}
          </b>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

// Markdown simple: párrafos, listas (-, *, • o 1.) y negritas.
function TextoModelo({ texto }: { texto: string }) {
  const bloques: ({ tipo: "p"; lineas: string[] } | { tipo: "ul" | "ol"; items: string[] })[] = [];
  for (const cruda of texto.split("\n")) {
    const l = cruda.trimEnd();
    const vineta = l.match(/^\s*[-*•]\s+(.*)$/);
    const numero = l.match(/^\s*\d+[.)]\s+(.*)$/);
    const ultimo = bloques.at(-1);
    if (vineta || numero) {
      const tipo = vineta ? "ul" : "ol";
      const contenido = (vineta ?? numero)![1]!;
      if (ultimo && ultimo.tipo === tipo) ultimo.items.push(contenido);
      else bloques.push({ tipo, items: [contenido] });
    } else if (!l.trim()) {
      bloques.push({ tipo: "p", lineas: [] });
    } else if (ultimo?.tipo === "p" && ultimo.lineas.length) {
      ultimo.lineas.push(l);
    } else {
      bloques.push({ tipo: "p", lineas: [l] });
    }
  }
  return (
    <>
      {bloques.map((b, i) =>
        b.tipo === "p" ? (
          b.lineas.length > 0 && (
            <p key={i} className="mb-2 last:mb-0">
              {b.lineas.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Negritas texto={l} />
                </Fragment>
              ))}
            </p>
          )
        ) : b.tipo === "ul" ? (
          <ul key={i} className="mt-1 mb-2 list-disc pl-[18px] last:mb-0">
            {b.items.map((t, j) => (
              <li key={j}>
                <Negritas texto={t} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="mt-1 mb-2 list-decimal pl-[18px] last:mb-0">
            {b.items.map((t, j) => (
              <li key={j}>
                <Negritas texto={t} />
              </li>
            ))}
          </ol>
        ),
      )}
    </>
  );
}

function Escribiendo({ estado }: { estado?: string | null }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5" role="status" aria-label={estado ?? "El asistente está escribiendo"}>
      <span className="escribiendo flex gap-1" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {estado && <span className="text-[12.5px] text-muted">{estado}</span>}
    </div>
  );
}

// Fila del asistente: ícono a la izquierda y contenido; `sinIcono` para tarjetas que siguen a un texto.
function FilaBot({ children, sinIcono = false }: { children: ReactNode; sinIcono?: boolean }) {
  return (
    <div className="grid max-w-full grid-cols-[28px_minmax(0,1fr)] items-start gap-2.5">
      {sinIcono ? (
        <span />
      ) : (
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-[9px] bg-grad text-white">
          <IconoChispa tam={15} conBrillo={false} />
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FichaArchivo({ a }: { a: Adjunto }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-[14px] bg-white py-2 pr-3 pl-2 text-[13px] text-ink shadow-neu-out-sm">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-ok text-[10px] font-bold text-ok-ink">
        {/\.csv$/i.test(a.nombre) ? "CSV" : "XLS"}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{a.nombre}</span>
        <small className="block text-[12px] leading-4 text-muted">
          {a.hojas} hoja{a.hojas === 1 ? "" : "s"} · <span className="num">{a.filas}</span> filas
        </small>
      </span>
    </span>
  );
}

function Tarjeta({ titulo, etiqueta, children, apagada = false }: { titulo: string; etiqueta?: string; children: ReactNode; apagada?: boolean }) {
  return (
    <div className={`mt-2.5 overflow-hidden rounded-card bg-white shadow-neu-out-sm ${apagada ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2.5 px-3.5 pt-3 pb-2.5">
        {/* Si no cabe, se acorta primero la etiqueta (encoge 6 veces más rápido que el título). */}
        <b className="min-w-0 truncate text-[14px] font-semibold">{titulo}</b>
        {etiqueta && <span className="min-w-[56px] shrink-[6] truncate text-[12px] text-muted">{etiqueta}</span>}
      </div>
      {children}
    </div>
  );
}

const Acciones = ({ children }: { children: ReactNode }) => <div className="flex justify-end gap-2 px-3.5 pt-3 pb-3.5">{children}</div>;

function AvisoError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mx-3.5 mt-2.5 rounded-[10px] bg-warn px-2.5 py-2 text-[12.5px] leading-[18px] text-warn-ink">
      {children}
    </p>
  );
}

function Hecho({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-[12px] bg-ok px-3 py-2 text-[13px] text-ok-ink" role="status">
      <span aria-hidden="true">✓</span>
      <span className="min-w-0">{children}</span>
      {accion && <span className="ml-auto flex-none">{accion}</span>}
    </div>
  );
}
const claseEnlaceHecho = "cursor-pointer font-semibold text-ok-ink underline disabled:cursor-not-allowed disabled:opacity-60";

// ---------------------------------------------------------------------------
// Tarjeta de borrador: Confirmar llama a la acción del formulario.
// ---------------------------------------------------------------------------
function formulario(datos: Record<string, string>, extra: Record<string, string | null | undefined> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) fd.set(k, v);
  // Barrio, municipio o puesto que no estén en la lista se agregan como nuevos.
  for (const cat of ["barrio", "municipio", "puesto_votacion"]) fd.set(cat + SUFIJO_NUEVO, "1");
  for (const [k, v] of Object.entries(extra)) if (v) fd.set(k, v);
  return fd;
}

async function guardarBorrador(b: Borrador): Promise<Resultado> {
  if (b.clase === "persona") {
    return guardarPersona(formulario(b.datos, { id: b.registroId, referente_id: b.referente?.id, coordinador: b.coordinador }));
  }
  if (b.clase === "referente") return guardarReferente(formulario(b.datos, { id: b.registroId, tipo: b.tipo }));
  return vincularPersona(formulario({}, { persona_id: b.persona.id, referente_id: b.referente.id, coordinador: b.coordinador }));
}

function tituloBorrador(b: Borrador) {
  if (b.clase === "vinculo") return "Vincular a un referente";
  const que = b.clase === "persona" ? "persona" : nombreTipo(b.tipo).toLowerCase();
  if (b.accion === "editar") return `Editar ${que}: ${b.datos.nombre ?? ""}`;
  return b.clase === "persona" ? "Nueva persona" : `Nuevo ${que}`;
}

// Aviso amarillo: lo que le falta al registro (se puede completar después).
function faltante(b: Borrador): string | null {
  if (b.clase === "vinculo") {
    const ya = b.campos.find(([k]) => k === "Ya está con");
    return ya ? `Ya está con ${ya[1]}. Quedará vinculada a los dos.` : null;
  }
  const faltan = [
    !b.datos.cedula && "cédula",
    !b.datos.barrio && "barrio",
    !b.datos.puesto_votacion && "puesto",
  ].filter(Boolean) as string[];
  if (!faltan.length) return null;
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(", ")} ni ${faltan.at(-1)}`;
  return `No tiene ${lista}. Puede completarlo después en su ficha.`;
}

function TarjetaBorrador({ borrador, alTerminar }: { borrador: Borrador; alTerminar: (nota: string) => void }) {
  const [estado, setEstado] = useState<"pendiente" | "guardando" | "guardado" | "descartado">("pendiente");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function confirmar() {
    setEstado("guardando");
    const r = await guardarBorrador(borrador);
    setResultado(r);
    if (r.ok) {
      setEstado("guardado");
      alTerminar(`[La usuaria confirmó y se guardó: ${borrador.titulo}]`);
    } else {
      setEstado("pendiente");
      const motivo = r.mensaje ?? Object.values(r.errores ?? {}).join(" ");
      alTerminar(`[No se pudo guardar "${borrador.titulo}": ${motivo}]`);
    }
  }

  const errores = resultado && !resultado.ok ? [resultado.mensaje, ...Object.values(resultado.errores ?? {})].filter(Boolean) : [];
  const aviso = faltante(borrador);

  return (
    <>
      <Tarjeta titulo={tituloBorrador(borrador)} etiqueta={estado === "descartado" ? "Descartado" : "Borrador"} apagada={estado === "descartado"}>
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-3.5 text-[13px]">
          {borrador.campos.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium break-words">{v}</dd>
            </Fragment>
          ))}
        </dl>
        {aviso && estado !== "descartado" && (
          <p className="mx-3.5 mt-2.5 rounded-[10px] bg-note px-2.5 py-2 text-[12.5px] leading-[18px] text-note-ink">{aviso}</p>
        )}
        {errores.length > 0 && <AvisoError>{errores.join(" ")}</AvisoError>}
        {estado === "pendiente" || estado === "guardando" ? (
          <Acciones>
            <button
              type="button"
              className={btnSec}
              disabled={estado === "guardando"}
              onClick={() => {
                setEstado("descartado");
                alTerminar(`[La usuaria descartó: ${borrador.titulo}]`);
              }}
            >
              Descartar
            </button>
            <button type="button" className={btnPri} onClick={confirmar} disabled={estado === "guardando"}>
              {estado === "guardando" ? "Guardando..." : "Confirmar"}
            </button>
          </Acciones>
        ) : (
          <div className="h-3.5" />
        )}
      </Tarjeta>
      {estado === "guardado" && (
        <Hecho
          accion={
            resultado?.href && (
              <Link href={resultado.href} className={claseEnlaceHecho}>
                Abrir
              </Link>
            )
          }
        >
          Guardado: {borrador.titulo}.
        </Hecho>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Importación: vista previa única por secciones (sin IA) → Importar → Deshacer lote.
// Formato de la campaña: lib/campana.ts y docs/FORMATO_EXCEL.md.
// ---------------------------------------------------------------------------
type FuenteImportacion = { modo: "mapeo"; mapeo: Mapeo } | { modo: "campana"; hoja: string; filtro: FiltroCampana };
type TonoSeccion = "ok" | "nota" | "neutro" | "aviso";
const COLOR_TONO: Record<TonoSeccion, string> = {
  ok: "bg-ok text-ok-ink",
  nota: "bg-note text-note-ink",
  neutro: "bg-neu text-muted",
  aviso: "bg-warn text-warn-ink",
};

function SeccionFilas({ titulo, filas, tono, abierta }: { titulo: string; filas: FilaPlan[]; tono: TonoSeccion; abierta?: boolean }) {
  if (!filas.length) return null;
  return (
    <details className="mx-3.5 mt-2.5" open={abierta}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-brand [&::-webkit-details-marker]:hidden">
        {titulo} <span className="num font-normal text-muted">({filas.length})</span> ▾
      </summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="border-b border-linea px-2 py-1.5 font-semibold">Fila</th>
              <th className="border-b border-linea px-2 py-1.5 font-semibold">Nombre</th>
              <th className="border-b border-linea px-2 py-1.5 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 500).map((f, i) => (
              <tr key={`${f.fila}-${i}`} className="align-top">
                <td className="num border-b border-linea px-2 py-[7px]">{f.fila ?? "—"}</td>
                <td className="border-b border-linea px-2 py-[7px]">{f.nombre}</td>
                <td className="border-b border-linea px-2 py-[7px]">
                  <span className={`inline-block rounded-[9px] px-2 py-px text-[12px] leading-[17px] ${COLOR_TONO[tono]}`}>{f.detalle}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length > 500 && <p className="mt-1 text-[12px] text-muted">Se muestran 500 de {filas.length}.</p>}
      </div>
    </details>
  );
}

function Casilla({ marcada, alCambiar, children, desactivada }: { marcada: boolean; alCambiar: (v: boolean) => void; children: ReactNode; desactivada?: boolean }) {
  return (
    <label className="mx-3.5 mt-2.5 flex cursor-pointer items-start gap-2 text-[13px]">
      <input type="checkbox" className="mt-[3px] h-4 w-4 flex-none accent-brand" checked={marcada} disabled={desactivada} onChange={(e) => alCambiar(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function TarjetaImportacion({
  fuente,
  archivo,
  libro,
  alResumen,
  alNota,
}: {
  fuente: FuenteImportacion;
  archivo: string;
  libro: Libro | null;
  /** Manda al asistente el resumen de la vista previa (conteos y máximo 10 ejemplos). */
  alResumen: (texto: string) => void;
  alNota: (texto: string) => void;
}) {
  const [filas, setFilas] = useState<FilaMapeada[] | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<"revisando" | "lista" | "importando" | "importada" | "cancelada" | "deshaciendo" | "deshecha">("revisando");
  const [resoluciones, setResoluciones] = useState<Record<string, Resolucion>>({});
  const [todasAutorizaron, setTodasAutorizaron] = useState(fuente.modo === "mapeo" && fuente.mapeo.todas_autorizaron === true);
  const [lote, setLote] = useState<{ id: string; mensaje: string; fecha: Date } | null>(null);
  const [deshecho, setDeshecho] = useState<ResultadoDeshacer | null>(null);
  const iniciado = useRef(false);

  const entrada = (
    f: FilaMapeada[],
    cambios: { resoluciones?: Record<string, Resolucion> } = {},
  ): EntradaImportacion =>
    fuente.modo === "campana"
      ? {
          modo: "campana",
          filas: f,
          filtro: { alcance: fuente.filtro.alcance, lideres: fuente.filtro.lideres },
          resoluciones: cambios.resoluciones ?? resoluciones,
          todasAutorizaron,
        }
      : { modo: "mapeo", tipo: fuente.mapeo.tipo, filas: f, todasAutorizaron };

  // Primera vista previa: se arma con todas las filas y se le manda el resumen al asistente.
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      const nombreHoja = fuente.modo === "campana" ? fuente.hoja : fuente.mapeo.hoja;
      const hoja = libro?.hojas.find((h) => h.nombre === nombreHoja);
      if (!libro || !hoja) {
        setError("El archivo ya no está cargado. Adjúntelo de nuevo.");
        return;
      }
      let mapeadas: FilaMapeada[];
      if (fuente.modo === "campana") {
        const columnas = detectarFormatoCampana(hoja.encabezados);
        if (!columnas) {
          setError("La hoja no tiene el formato de la campaña.");
          return;
        }
        mapeadas = filasCampana(hoja.filas, columnas, hoja.filaEncabezado + 1, fuente.filtro.condiciones ?? []);
      } else {
        const errores = revisarMapeo(fuente.mapeo, hoja.encabezados);
        if (errores.length) {
          setError(errores.join(" "));
          alResumen(`[La vista previa no se pudo hacer: ${errores.join(" ")}]`);
          return;
        }
        mapeadas = aplicarMapeo(hoja.filas, fuente.mapeo, hoja.filaEncabezado + 1);
      }
      if (mapeadas.length > MAX_FILAS) {
        setError(`El archivo tiene ${mapeadas.length} filas; el máximo es ${MAX_FILAS}. Divídalo en partes.`);
        return;
      }
      setFilas(mapeadas);
      const v = await previsualizarImportacion(entrada(mapeadas));
      setVista(v);
      if (!v.ok) {
        setError(v.mensaje ?? "No se pudo revisar el archivo.");
        return;
      }
      setEstado("lista");
      alResumen(
        `[Resultado de la vista previa de importación: ${JSON.stringify(v.resumen)}] Explíquelo en máximo dos frases cortas, sin listas ni números de fila: la tabla ya muestra el detalle.`,
      );
    })();
    // Solo una vez por tarjeta (entrada usa el estado inicial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro, fuente, alResumen]);

  // Las decisiones de la usuaria (dudas, sin líder) rehacen la vista previa, sin el asistente.
  async function revisarDeNuevo(cambios: { resoluciones?: Record<string, Resolucion> }) {
    if (!filas) return;
    setEstado("revisando");
    setError(null);
    const v = await previsualizarImportacion(entrada(filas, cambios));
    setVista(v);
    if (!v.ok) setError(v.mensaje ?? "No se pudo revisar el archivo.");
    setEstado("lista");
  }

  function resolver(clave: string, r: Resolucion) {
    const nuevas = { ...resoluciones, [clave]: r };
    setResoluciones(nuevas);
    void revisarDeNuevo({ resoluciones: nuevas });
  }

  async function importar() {
    if (!filas) return;
    setEstado("importando");
    setError(null);
    const r = await confirmarImportacion(archivo, entrada(filas));
    if (r.ok && r.loteId) {
      setLote({ id: r.loteId, mensaje: r.mensaje, fecha: new Date() });
      setEstado("importada");
      alNota(`[Se importó el lote: ${r.mensaje}]`);
    } else {
      setError(r.mensaje);
      setEstado("lista");
    }
  }

  async function deshacer() {
    if (!lote) return;
    setEstado("deshaciendo");
    const r = await deshacerLote(lote.id);
    setDeshecho(r);
    setEstado(r.ok ? "deshecha" : "importada");
    if (r.ok) alNota(`[Se deshizo el lote: ${r.mensaje}]`);
  }

  const v = vista?.ok ? vista : null;
  const editable = estado === "lista" && !lote;
  const conteos: [string, number, string][] = v
    ? [
        ["se importan", v.total, COLOR_TONO.ok],
        ["ya existen", v.existentes.length, COLOR_TONO.neutro],
        ["con problemas", v.problemas.length, COLOR_TONO.aviso],
      ]
    : [];
  const ref = v?.etiquetaReferentes ?? "Líderes";
  const etiqueta = fuente.modo === "campana" ? `${archivo} · ${fuente.hoja}` : archivo;

  return (
    <>
      <Tarjeta titulo="Vista previa de la importación" etiqueta={etiqueta} apagada={estado === "cancelada"}>
        {estado === "revisando" && !error && (
          <div className="px-3.5">
            <Escribiendo estado="Revisando las filas…" />
          </div>
        )}

        {conteos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 px-3.5">
            {conteos.map(([k, n, color]) => (
              <div key={k} className={`rounded-[12px] px-2.5 py-2 ${color}`}>
                <b className="num block text-[20px] leading-[26px]">{n}</b>
                <span className="text-[12px]">{k}</span>
              </div>
            ))}
          </div>
        )}

        {v && (
          <>
            {v.dudas.length > 0 && (
              <div className="mx-3.5 mt-2.5 rounded-[12px] bg-note px-3 py-2 text-[12.5px] leading-[18px] text-note-ink">
                <p className="font-semibold">¿Es el mismo líder? Hasta que lo confirme, no se importa.</p>
                <ul className="mt-1.5 grid gap-2">
                  {v.dudas.map((d) => (
                    <li key={d.clave} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        «{d.nombre}» se parece a «{d.candidato.nombre}» ({d.filas} {d.filas === 1 ? "fila" : "filas"})
                      </span>
                      <button type="button" className={`${btnSec} h-[30px] px-3 text-[12.5px]`} disabled={!editable} onClick={() => resolver(d.clave, "mismo")}>
                        Es el mismo
                      </button>
                      <button type="button" className={`${btnSec} h-[30px] px-3 text-[12.5px]`} disabled={!editable} onClick={() => resolver(d.clave, "otro")}>
                        Es otro
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <SeccionFilas titulo={`${ref} nuevos`} filas={v.lideresNuevos} tono="ok" />
            <SeccionFilas titulo={`${ref} a completar`} filas={v.lideresCompletar} tono="ok" />
            <SeccionFilas titulo="Personas nuevas" filas={v.personasNuevas} tono="ok" />
            <SeccionFilas titulo="Ya existen (se omiten)" filas={v.existentes} tono="neutro" />
            <SeccionFilas titulo="Avisos" filas={v.avisos} tono="nota" abierta={v.avisos.length > 0 && v.avisos.length <= 10} />
            <SeccionFilas titulo="Problemas (no se importan)" filas={v.problemas} tono="aviso" abierta={v.problemas.length > 0 && v.problemas.length <= 10} />

            {v.sinLider > 0 && (
              <p className="mx-3.5 mt-2.5 text-[12.5px] leading-[18px] text-muted">
                {v.sinLider === 1 ? "1 persona no tiene líder" : `${v.sinLider} personas no tienen líder`}: quedan con «Sin líder asignado», con
                toda su información, para asignarles uno en Revisión.
              </p>
            )}
            {(v.personasNuevas.length > 0 || (fuente.modo === "mapeo" && fuente.mapeo.tipo === "persona")) && (
              <Casilla marcada={todasAutorizaron} desactivada={!editable} alCambiar={setTodasAutorizaron}>
                Todas las personas de este archivo autorizaron el tratamiento de sus datos (Ley 1581).
              </Casilla>
            )}
          </>
        )}

        {error && <AvisoError>{error}</AvisoError>}

        {estado === "lista" || estado === "importando" || (estado === "revisando" && v) ? (
          <Acciones>
            <button
              type="button"
              className={btnSec}
              disabled={estado !== "lista"}
              onClick={() => {
                setEstado("cancelada");
                alNota("[La usuaria canceló la importación]");
              }}
            >
              Cancelar
            </button>
            <button type="button" className={btnPri} onClick={importar} disabled={!v || v.total === 0 || estado !== "lista"}>
              {estado === "importando" ? "Importando..." : `Importar ${v?.total ?? 0}`}
            </button>
          </Acciones>
        ) : (
          <div className="h-3.5" />
        )}
      </Tarjeta>

      {estado === "cancelada" && <p className="mt-2 text-[12.5px] text-muted">Importación cancelada. No se guardó nada.</p>}

      {lote && !deshecho?.ok && (
        <Hecho
          accion={
            <button type="button" className={claseEnlaceHecho} onClick={deshacer} disabled={estado === "deshaciendo"}>
              {estado === "deshaciendo" ? "Deshaciendo..." : "Deshacer"}
            </button>
          }
        >
          {lote.mensaje} (lote del {fechaCorta(lote.fecha)})
        </Hecho>
      )}
      {deshecho && (
        <>
          {deshecho.ok ? <Hecho>{deshecho.mensaje}</Hecho> : <p className="mt-2 text-[13px] text-warn-ink">{deshecho.mensaje}</p>}
          {!!deshecho.bloqueados?.length && (
            <div className="mt-2 rounded-[12px] bg-note px-3 py-2 text-[12.5px] leading-[18px] text-note-ink">
              <p className="font-semibold">No se tocaron porque cambiaron después:</p>
              <ul className="mt-1 list-disc pl-[18px]">
                {deshecho.bloqueados.map((b) => (
                  <li key={b.id}>
                    {b.nombre}: {b.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export default function Asistente({ nombre = "" }: { nombre?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [ancho, setAncho] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [inicio, setInicio] = useState<Date | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [adjuntoNuevo, setAdjuntoNuevo] = useState(false); // falta enviarle el resumen al asistente

  // Lo que ve el modelo (solo texto; el servidor envía los últimos 20).
  const historial = useRef<MensajeChat[]>([]);
  const cola = useRef<{ modelo: string; visible: string | null; resumen?: boolean }[]>([]);
  const trabajando = useRef(false);
  const generacion = useRef(0); // cambia con "Nueva conversación": lo que llegue tarde se ignora
  const libroRef = useRef<Libro | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  const enNavegador = useEnNavegador();

  useEffect(() => {
    libroRef.current = libro;
  }, [libro]);

  // Scroll automático al último mensaje.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [items, estado, abierto]);

  // Ctrl+K (o Cmd+K) abre y cierra; Esc cierra.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((a) => !a);
      } else if (e.key === "Escape") {
        setAbierto(false);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  // Al abrir, el foco va al cuadro de texto.
  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto]);

  // El cuadro de texto crece de 1 a 6 líneas.
  useEffect(() => {
    const t = entrada.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 6 * 21 + 12)}px`;
  }, [texto]);

  useEffect(() => () => abortar.current?.abort(), []);

  const agregar = useCallback((item: NuevoItem) => {
    const id = nuevoId();
    setItems((xs) => [...xs, { ...item, id } as Item]);
    return id;
  }, []);

  // Una conversación con el servidor a la vez; lo demás espera en la cola.
  const procesar = useCallback(async () => {
    if (trabajando.current) return;
    trabajando.current = true;
    setOcupado(true);
    const gen = generacion.current;
    try {
      while (cola.current.length && gen === generacion.current) {
        const { modelo, visible, resumen } = cola.current.shift()!;
        if (visible !== null) agregar({ clase: "nota", texto: visible });
        historial.current.push({ rol: "user", texto: modelo });
        await conversar(resumen === true);
      }
    } finally {
      trabajando.current = false;
      setOcupado(false);
      setEstado(null);
      // Si se reinició mientras tanto y hay algo nuevo en la cola, se atiende.
      if (gen !== generacion.current && cola.current.length) void procesar();
    }

    async function conversar(esResumen: boolean) {
      const idRespuesta = nuevoId();
      let respuesta = "";
      const extras: string[] = []; // lo que el modelo hizo con herramientas, para el siguiente turno
      setItems((xs) => [...xs, { id: idRespuesta, clase: "mensaje", rol: "assistant", texto: "" }]);
      const actualizar = (t: string, error = false) => {
        if (gen !== generacion.current) return;
        setItems((xs) => xs.map((x) => (x.id === idRespuesta && x.clase === "mensaje" ? { ...x, texto: t, error: x.error || error } : x)));
      };

      const control = new AbortController();
      abortar.current = control;
      try {
        const lib = libroRef.current;
        const r = await fetch("/api/asistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial.current.slice(-20), hojas: lib ? encabezadosPorHoja(lib) : {}, resumen: esResumen }),
          signal: control.signal,
        });
        if (!r.ok || !r.body) {
          const e = (await r.json().catch(() => null)) as { error?: string } | null;
          actualizar(e?.error ?? "No se pudo hablar con el asistente.", true);
          return;
        }
        const lector = r.body.getReader();
        const deco = new TextDecoder();
        let resto = "";
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += deco.decode(value, { stream: true });
          const lineas = resto.split("\n");
          resto = lineas.pop() ?? "";
          for (const l of lineas) {
            if (!l.trim() || gen !== generacion.current) continue;
            const e = JSON.parse(l) as Evento;
            if (e.tipo === "texto") {
              respuesta += e.texto;
              actualizar(respuesta);
              setEstado(null);
            } else if (e.tipo === "estado") {
              setEstado(e.texto);
            } else if (e.tipo === "borrador") {
              agregar({ clase: "borrador", borrador: e.borrador });
              extras.push(`[Mostré el borrador: ${e.borrador.titulo}]`);
            } else if (e.tipo === "mapeo") {
              agregar({ clase: "importacion", fuente: { modo: "mapeo", mapeo: e.mapeo }, archivo: lib?.nombre ?? "archivo" });
              extras.push(`[Propuse importar la hoja "${e.mapeo.hoja}" como ${NOMBRE_TIPO[e.mapeo.tipo]}]`);
            } else if (e.tipo === "importar_campana") {
              agregar({ clase: "importacion", fuente: { modo: "campana", hoja: e.hoja, filtro: e.filtro }, archivo: lib?.nombre ?? "archivo" });
              extras.push(`[Pedí la vista previa de la hoja "${e.hoja}" (formato de campaña, alcance: ${e.filtro.alcance})]`);
            } else if (e.tipo === "error") {
              respuesta += (respuesta ? "\n\n" : "") + e.texto;
              actualizar(respuesta, true);
            }
          }
        }
      } catch {
        if (!control.signal.aborted) actualizar(respuesta + (respuesta ? "\n\n" : "") + "Se perdió la conexión con el asistente.", true);
      } finally {
        if (abortar.current === control) abortar.current = null;
        if (gen === generacion.current) {
          const completo = [respuesta.trim(), ...extras].filter(Boolean).join("\n");
          if (completo) historial.current.push({ rol: "assistant", texto: completo });
          // Sin texto (solo hubo tarjetas): se quita la fila vacía.
          if (!respuesta.trim()) setItems((xs) => xs.filter((x) => x.id !== idRespuesta));
        }
      }
    }
  }, [agregar]);

  const enviarAlModelo = useCallback(
    (modelo: string, visible: string | null, resumen = false) => {
      cola.current.push({ modelo, visible, resumen });
      void procesar();
    },
    [procesar],
  );

  // Notas para el siguiente turno (confirmaciones, importaciones): no disparan respuesta.
  const anotar = useCallback((nota: string) => {
    historial.current.push({ rol: "user", texto: nota });
  }, []);

  const archivoPendiente = libro && adjuntoNuevo ? libro : null;
  const puedeEnviar = !ocupado && !leyendo && (texto.trim() !== "" || !!archivoPendiente);

  function enviar(textoDirecto?: string) {
    const t = (textoDirecto ?? texto).trim();
    if (ocupado || leyendo || (!t && !archivoPendiente)) return;
    if (textoDirecto === undefined) setTexto("");
    let modelo = t;
    let adjunto: Adjunto | undefined;
    if (archivoPendiente) {
      modelo = `${t || "Adjunté este archivo."}\n\n${resumenArchivo(archivoPendiente)}`;
      adjunto = {
        nombre: archivoPendiente.nombre,
        hojas: archivoPendiente.hojas.length,
        filas: archivoPendiente.hojas.reduce((s, h) => s + h.filas.length, 0),
      };
      setAdjuntoNuevo(false);
    }
    if (!inicio) setInicio(new Date());
    agregar({ clase: "mensaje", rol: "user", texto: t, adjunto });
    cola.current.push({ modelo, visible: null });
    void procesar();
  }

  function nuevaConversacion() {
    generacion.current++;
    abortar.current?.abort();
    abortar.current = null;
    cola.current = [];
    historial.current = [];
    setItems([]);
    setInicio(null);
    setEstado(null);
    setTexto("");
    setLibro(null);
    libroRef.current = null;
    setAdjuntoNuevo(false);
    entrada.current?.focus();
  }

  function quitarArchivo() {
    setLibro(null);
    libroRef.current = null;
    setAdjuntoNuevo(false);
    entrada.current?.focus();
  }

  async function alElegirArchivo(f: File | undefined) {
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      agregar({ clase: "nota", texto: "Solo se pueden adjuntar archivos .xlsx o .csv." });
      return;
    }
    setLeyendo(true);
    try {
      const l = await leerArchivo(f);
      setLibro(l);
      libroRef.current = l;
      setAdjuntoNuevo(true);
      entrada.current?.focus();
    } catch (e) {
      agregar({ clase: "nota", texto: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    } finally {
      setLeyendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  // ¿La última fila es la respuesta del asistente todavía vacía? Ahí van los 3 puntos.
  const ultimo = items.at(-1);
  const esperandoTexto = ocupado && ultimo?.clase === "mensaje" && ultimo.rol === "assistant" && !ultimo.texto;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls="panel-asistente"
        aria-keyshortcuts="Control+K"
        title="Asistente (Ctrl+K)"
        className={`flex h-[42px] flex-none cursor-pointer items-center gap-2 rounded-ctl pr-4 pl-3 font-semibold transition max-[859px]:order-2 max-[480px]:pr-3 ${
          abierto ? "bg-grad text-white shadow-boton" : "bg-white text-brand shadow-neu-out-sm hover:brightness-98"
        }`}
      >
        <IconoChispa />
        <span className="max-[480px]:hidden">Asistente</span>
        <kbd
          className={`rounded-md px-1.5 font-sans text-[12px] font-medium max-[859px]:hidden ${abierto ? "bg-white/20 text-white" : "bg-brand/8 text-muted"}`}
        >
          Ctrl K
        </kbd>
      </button>

      {/* Portal a <body>: la barra superior usa backdrop-filter, que encerraría
          dentro de ella a los elementos position:fixed. */}
      {enNavegador &&
        createPortal(
          <>
            {/* Velo: clic fuera cierra. En celular el panel ocupa toda la pantalla y no hay velo. */}
            {abierto && <div className="fixed inset-0 z-40 bg-velo max-[859px]:hidden" aria-hidden="true" onClick={() => setAbierto(false)} />}

            {/* Siempre montado (solo se oculta): así las tarjetas no se repiten al reabrir. */}
            <aside
              id="panel-asistente"
              role="dialog"
              aria-label="Asistente"
              aria-hidden={!abierto}
              aria-busy={ocupado}
              className={`${abierto ? "flex" : "hidden"} fixed top-3 right-3 bottom-3 z-50 flex-col overflow-hidden rounded-asistente border border-glass-line bg-asistente text-ink shadow-asistente backdrop-asistente transition-[width] duration-200 max-[859px]:inset-0 max-[859px]:w-auto max-[859px]:rounded-none ${
                ancho ? "w-[min(780px,calc(100vw-24px))]" : "w-[448px]"
              }`}
            >
              {/* Cabecera fija */}
              <header className="flex flex-none items-center gap-2.5 border-b border-linea pt-4 pr-3.5 pb-3.5 pl-[18px]">
                <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-ctl bg-grad text-white shadow-icono">
                  <IconoChispa tam={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] leading-[22px] font-bold">Asistente</h2>
                  <p className="flex items-center gap-1.5 text-[12.5px] leading-[17px] text-muted">
                    <i className="h-[7px] w-[7px] flex-none rounded-full bg-brand-2 shadow-punto" aria-hidden="true" />
                    No guarda nada sin su confirmación
                  </p>
                </div>
                <div className="flex flex-none items-center">
                  <button type="button" className={claseIcono} title="Nueva conversación" aria-label="Nueva conversación" onClick={nuevaConversacion}>
                    <IconoNueva />
                  </button>
                  <button
                    type="button"
                    className={`${claseIcono} max-[859px]:hidden`}
                    title={ancho ? "Reducir" : "Ampliar"}
                    aria-label={ancho ? "Reducir panel" : "Ampliar panel"}
                    aria-pressed={ancho}
                    onClick={() => setAncho((a) => !a)}
                  >
                    {ancho ? <IconoReducir /> : <IconoAmpliar />}
                  </button>
                  <button type="button" className={claseIcono} title="Cerrar (Esc)" aria-label="Cerrar" onClick={() => setAbierto(false)}>
                    <IconoCerrar />
                  </button>
                </div>
              </header>

              {/* Cuerpo con scroll */}
              <div ref={lista} className="asistente-cuerpo flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[18px] pt-5 pb-2" aria-live="polite">
                {items.length === 0 ? (
                  <div className="my-auto px-1 py-2">
                    <h2 className="mb-1 text-[22px] leading-[30px] font-bold tracking-[-.01em]">{primerNombre ? `Hola, ${primerNombre}` : "Hola"}</h2>
                    <p className="mb-[18px] text-muted">Pregunte por líderes y personas, o adjunte un Excel para cargar datos.</p>
                    <div className="grid gap-2">
                      {SUGERENCIAS.map((s) => (
                        <button
                          key={s.texto}
                          type="button"
                          onClick={() => enviar(s.texto)}
                          disabled={ocupado}
                          className="flex cursor-pointer items-center gap-3 rounded-[16px] bg-white px-3.5 py-3 text-left shadow-neu-out-sm transition hover:-translate-y-px hover:text-brand"
                        >
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-neu font-semibold text-brand shadow-neu-in">{s.icono}</span>
                          <span>
                            {s.texto}
                            <small className="block text-[12.5px] leading-[17px] text-muted">{s.detalle}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-[18px] flex gap-2 text-[12.5px] leading-[18px] text-muted">
                      <IconoEscudo />
                      El archivo se lee en su equipo y no se guarda. La conversación se borra al recargar.
                    </p>
                  </div>
                ) : (
                  <>
                    {inicio && <span className="self-center rounded-full bg-brand/6 px-2.5 py-0.5 text-[12px] text-faint">Hoy, {hora(inicio)}</span>}
                    {items.map((it, i) => {
                      const anterior = items[i - 1];
                      // Tarjeta que sigue a una respuesta del asistente: sin repetir el ícono.
                      const sigueAlBot = anterior?.clase === "mensaje" ? anterior.rol === "assistant" : anterior?.clase === "borrador" || anterior?.clase === "importacion";
                      if (it.clase === "mensaje" && it.rol === "user") {
                        return (
                          <div key={it.id} className="flex max-w-[84%] flex-col items-end gap-1.5 self-end">
                            {it.adjunto && <FichaArchivo a={it.adjunto} />}
                            {it.texto && (
                              <span className="rounded-[18px_18px_6px_18px] bg-grad px-3.5 py-2.5 whitespace-pre-wrap text-white shadow-burbuja">{it.texto}</span>
                            )}
                          </div>
                        );
                      }
                      if (it.clase === "mensaje") {
                        const vacia = !it.texto;
                        return (
                          <FilaBot key={it.id}>
                            {vacia ? (
                              <Escribiendo estado={it === ultimo ? estado : null} />
                            ) : (
                              <div className={it.error ? "text-warn-ink" : ""}>
                                <TextoModelo texto={it.texto} />
                              </div>
                            )}
                          </FilaBot>
                        );
                      }
                      if (it.clase === "nota") {
                        return (
                          <p key={it.id} className="self-center text-center text-[12px] text-faint">
                            {it.texto}
                          </p>
                        );
                      }
                      return (
                        <FilaBot key={it.id} sinIcono={sigueAlBot}>
                          {it.clase === "borrador" ? (
                            <TarjetaBorrador borrador={it.borrador} alTerminar={anotar} />
                          ) : (
                            <TarjetaImportacion
                              fuente={it.fuente}
                              archivo={it.archivo}
                              libro={libro}
                              alResumen={(t) => enviarAlModelo(t, "Resumen de la vista previa enviado al asistente.", true)}
                              alNota={anotar}
                            />
                          )}
                        </FilaBot>
                      );
                    })}
                    {/* Herramienta en curso después de un texto: los 3 puntos al final. */}
                    {ocupado && !esperandoTexto && estado && (
                      <FilaBot>
                        <Escribiendo estado={estado} />
                      </FilaBot>
                    )}
                  </>
                )}
              </div>

              {/* Compositor fijo abajo */}
              <form
                className="flex-none border-t border-linea bg-linear-to-b from-transparent to-asistente to-30% px-3.5 pt-2.5 pb-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar();
                }}
              >
                <div className="rounded-[20px] bg-white p-2 shadow-caja transition focus-within:shadow-caja-foco">
                  {(archivoPendiente || leyendo) && (
                    <div className="m-0.5 mb-1.5 inline-flex max-w-full items-center gap-2 rounded-[12px] bg-neu py-1.5 pr-1.5 pl-2.5 text-[12.5px]">
                      <IconoClip />
                      <span className="min-w-0 truncate">
                        {leyendo
                          ? "Leyendo el archivo…"
                          : `${archivoPendiente!.nombre} · ${archivoPendiente!.hojas.length} hoja${archivoPendiente!.hojas.length === 1 ? "" : "s"} · ${archivoPendiente!.hojas.reduce((s, h) => s + h.filas.length, 0)} filas`}
                      </span>
                      {archivoPendiente && (
                        <button
                          type="button"
                          onClick={quitarArchivo}
                          aria-label={`Quitar ${archivoPendiente.nombre}`}
                          className="flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center rounded-[7px] text-muted hover:bg-white hover:text-ink"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                  <textarea
                    ref={entrada}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    rows={1}
                    maxLength={4000}
                    placeholder="Pregunte algo o adjunte un Excel…"
                    aria-label="Mensaje"
                    className="block max-h-[138px] min-h-[44px] w-full resize-none bg-transparent px-2 py-1.5 leading-[21px] placeholder:text-faint sin-anillo"
                  />
                  <div className="flex items-center gap-2 px-0.5 pt-0.5">
                    <input
                      ref={archivo}
                      type="file"
                      accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      className="hidden"
                      onChange={(e) => alElegirArchivo(e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => archivo.current?.click()}
                      disabled={leyendo}
                      className={claseIcono}
                      title="Adjuntar Excel o CSV"
                      aria-label="Adjuntar Excel o CSV"
                    >
                      <IconoClip />
                    </button>
                    <span className="flex-1 truncate text-[12px] text-faint">Enter para enviar · Shift+Enter nueva línea</span>
                    <button
                      type="submit"
                      disabled={!puedeEnviar}
                      aria-label="Enviar"
                      className="flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center rounded-[12px] bg-grad text-white shadow-icono transition disabled:cursor-not-allowed disabled:bg-apagado disabled:bg-none disabled:shadow-none"
                    >
                      <IconoEnviar />
                    </button>
                  </div>
                </div>
              </form>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
