"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import {
  datosReferenteParaEditar,
  vincularPersona,
  type Resultado,
} from "@/app/(privado)/acciones";
import { EJES, nombreTipo, slugDeTipo, type TipoReferente } from "@/lib/ejes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type {
  Persona,
  ReferenteEdicion,
  ReferenteResumen,
  ResultadoBusqueda,
  VinculoDePersona,
} from "@/lib/tipos";
import { Aviso, Campo, Texto } from "./campos";
import { Dialogo } from "./dialogo";
import { FormPersona, FormReferente, SelectorReferente } from "./formularios";
import { IconoBuscar, IconoEnlace, IconoLapiz, IconoMas, boton } from "./ui";

type Clase = keyof typeof boton;

// ---------------------------------------------------------------------------
// Referentes
// ---------------------------------------------------------------------------
export function BotonNuevoReferente({ tipo, clase = "primario" }: { tipo: TipoReferente; clase?: Clase }) {
  const [abierto, setAbierto] = useState(false);
  const uno = EJES[slugDeTipo(tipo)].uno;
  return (
    <>
      <button type="button" className={boton[clase]} onClick={() => setAbierto(true)}>
        <IconoMas /> Nuevo {uno}
      </button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={`Nuevo ${uno}`} ancho="lg">
        <FormReferente tipo={tipo} alCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

export function BotonEditarReferente({ id, tipo }: { id: string; tipo: TipoReferente }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<ReferenteEdicion | null>(null);
  const [error, setError] = useState(false);
  const [cargando, iniciar] = useTransition();

  function abrir() {
    setAbierto(true);
    setError(false);
    iniciar(async () => {
      const d = await datosReferenteParaEditar(id);
      if (d) setDatos(d as ReferenteEdicion);
      else setError(true);
    });
  }
  const cerrar = () => {
    setAbierto(false);
    setDatos(null);
  };

  return (
    <>
      <button type="button" className={boton.secundarioSm} onClick={abrir}>
        <IconoLapiz /> Editar
      </button>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={`Editar ${EJES[slugDeTipo(tipo)].uno}`} ancho="lg">
        {error ? (
          <Aviso>No se pudieron cargar los datos. Intenta de nuevo.</Aviso>
        ) : cargando || !datos ? (
          <p className="py-6 text-center text-muted">Cargando...</p>
        ) : (
          <FormReferente tipo={tipo} referente={datos} alCerrar={cerrar} />
        )}
      </Dialogo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export function BotonNuevaPersona({
  referentes,
  referenteInicial,
  clase = "secundario",
}: {
  referentes: ReferenteResumen[];
  referenteInicial?: string;
  clase?: Clase;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={boton[clase]} onClick={() => setAbierto(true)}>
        <IconoMas /> Nueva persona
      </button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Nueva persona" ancho="lg">
        <FormPersona referentes={referentes} referenteInicial={referenteInicial} alCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

export function BotonEditarPersona({ persona }: { persona: Persona }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={boton.primarioSm} onClick={() => setAbierto(true)}>
        <IconoLapiz /> Editar
      </button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Editar persona" ancho="lg">
        <FormPersona persona={persona} alCerrar={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vincular
// ---------------------------------------------------------------------------
function useVincular(alTerminar: () => void) {
  const router = useRouter();
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await vincularPersona(fd);
      setEstado(r);
      if (r.ok) {
        alTerminar();
        if (r.href) router.push(r.href);
      }
    });
  }
  return { estado, enviando, enviar };
}

function AvisoOtrosReferentes({ vinculos, referenteId }: { vinculos: { nombre: string; tipo: TipoReferente; id: string }[]; referenteId?: string }) {
  if (referenteId && vinculos.some((v) => v.id === referenteId)) {
    return <Aviso>Esta persona ya está vinculada a este referente.</Aviso>;
  }
  if (!vinculos.length) return null;
  return (
    <Aviso tono="nota">
      Ya está con {vinculos.map((v) => `${v.nombre} (${nombreTipo(v.tipo).toLowerCase()})`).join(" y ")}. Si continúas, quedará con{" "}
      {vinculos.length + 1} referentes.
    </Aviso>
  );
}

// Desde el referente: buscar una persona existente o crearla.
export function BotonVincularPersona({
  referenteId,
  referenteNombre,
  referentes,
}: {
  referenteId: string;
  referenteNombre: string;
  referentes: ReferenteResumen[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"buscar" | "crear">("buscar");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null);
  const [elegida, setElegida] = useState<ResultadoBusqueda | null>(null);
  const [susVinculos, setSusVinculos] = useState<{ id: string; nombre: string; tipo: TipoReferente }[] | null>(null);
  const cerrar = () => {
    setAbierto(false);
    setModo("buscar");
    setTexto("");
    setResultados(null);
    setElegida(null);
    setSusVinculos(null);
  };
  const { estado, enviando, enviar } = useVincular(cerrar);

  // Búsqueda mientras se escribe (por nombre o últimos dígitos de cédula)
  useEffect(() => {
    if (!abierto || modo !== "buscar") return;
    const t = texto.trim();
    if (t.length < 2) return;
    let vigente = true;
    const h = setTimeout(async () => {
      const { data } = await crearClienteNavegador().rpc("buscar_personas", { p_texto: t });
      if (vigente) setResultados((data as ResultadoBusqueda[]) ?? []);
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(h);
    };
  }, [texto, abierto, modo]);

  // Al elegir una persona, se cargan sus referentes para avisar.
  useEffect(() => {
    if (!elegida) return;
    let vigente = true;
    crearClienteNavegador()
      .from("vinculos")
      .select("referente:referentes!inner(id,nombre,tipo)")
      .eq("persona_id", elegida.id)
      .eq("activo", true)
      .then(({ data }) => {
        if (!vigente) return;
        const filas = (data ?? []) as unknown as { referente: { id: string; nombre: string; tipo: TipoReferente } }[];
        setSusVinculos(filas.map((f) => f.referente));
      });
    return () => {
      vigente = false;
    };
  }, [elegida]);

  const yaEsta = susVinculos?.some((v) => v.id === referenteId) ?? false;

  return (
    <>
      <button type="button" className={boton.secundarioSm} onClick={() => setAbierto(true)}>
        <IconoEnlace /> Vincular persona
      </button>
      <Dialogo
        abierto={abierto}
        alCerrar={cerrar}
        titulo={modo === "buscar" ? "Vincular persona" : "Nueva persona"}
        descripcion={`a ${referenteNombre}`}
        ancho={modo === "crear" ? "lg" : "md"}
      >
        {modo === "crear" ? (
          <FormPersona referentes={referentes} referenteInicial={referenteId} nombreInicial={/\d/.test(texto) ? "" : texto} alCerrar={cerrar} />
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <input type="hidden" name="referente_id" value={referenteId} />
            {elegida ? (
              <>
                <input type="hidden" name="persona_id" value={elegida.id} />
                <div className="flex items-center justify-between gap-3 rounded-md border border-ink/70 bg-raised px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{elegida.nombre}</div>
                    <div className="text-[13px] text-muted">
                      {elegida.cedula_final ? `Cédula •••• ${elegida.cedula_final}` : "Sin cédula"}
                      {elegida.barrio ? ` · ${elegida.barrio}` : ""}
                    </div>
                  </div>
                  <button type="button" className={boton.secundarioSm} onClick={() => { setElegida(null); setSusVinculos(null); }}>
                    Cambiar
                  </button>
                </div>
                {susVinculos && <AvisoOtrosReferentes vinculos={susVinculos} referenteId={referenteId} />}
                <Campo etiqueta="Coordinador (opcional)">
                  <Texto name="coordinador" />
                </Campo>
              </>
            ) : (
              <>
                <label className="flex h-9 items-center gap-2 rounded-md border border-control px-2.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <IconoBuscar />
                  <input
                    autoFocus
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Nombre o últimos dígitos de la cédula"
                    aria-label="Buscar persona"
                    className="min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
                {texto.trim().length >= 2 && resultados && (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
                    {resultados.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setElegida(p)}
                          className="w-full cursor-pointer rounded-md border border-transparent px-3 py-2 text-left transition hover:border-control hover:bg-raised motion-safe:hover:translate-x-0.5"
                        >
                          <div className="truncate font-medium">{p.nombre}</div>
                          <div className="truncate text-[13px] text-muted">
                            {p.cedula_final ? `•••• ${p.cedula_final}` : "Sin cédula"}
                            {p.referente_nombre ? ` · con ${p.referente_nombre}` : " · sin referente"}
                          </div>
                        </button>
                      </li>
                    ))}
                    {resultados.length === 0 && <li className="px-3 py-2 text-muted">No se encontró a nadie.</li>}
                  </ul>
                )}
                <button type="button" className={`${boton.secundario} w-full`} onClick={() => setModo("crear")}>
                  <IconoMas /> Crear persona nueva
                </button>
              </>
            )}
            {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
            {elegida && (
              <div className="mt-2 flex justify-end gap-2 border-t border-rule pt-4">
                <button type="button" onClick={cerrar} className={boton.secundario}>
                  Cancelar
                </button>
                <button type="submit" disabled={enviando || yaEsta || !susVinculos} className={boton.primario}>
                  {enviando ? "Vinculando..." : "Vincular"}
                </button>
              </div>
            )}
          </form>
        )}
      </Dialogo>
    </>
  );
}

// Desde la persona: elegir otro referente.
export function BotonVincularAReferente({
  personaId,
  vinculos,
  referentes,
}: {
  personaId: string;
  vinculos: VinculoDePersona[];
  referentes: ReferenteResumen[];
}) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  const { estado, enviando, enviar } = useVincular(cerrar);
  const actuales = vinculos.map((v) => v.referente);

  return (
    <>
      <button type="button" className={boton.secundarioSm} onClick={() => setAbierto(true)}>
        <IconoEnlace /> Vincular a otro referente
      </button>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo="Vincular a otro referente">
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <input type="hidden" name="persona_id" value={personaId} />
          <AvisoOtrosReferentes vinculos={actuales} />
          <Campo etiqueta="Referente" error={estado?.errores?.referente_id}>
            <SelectorReferente referentes={referentes} excluir={actuales.map((r) => r.id)} requerido />
          </Campo>
          <Campo etiqueta="Coordinador (opcional)">
            <Texto name="coordinador" />
          </Campo>
          {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
          <div className="mt-2 flex justify-end gap-2 border-t border-rule pt-4">
            <button type="button" onClick={cerrar} className={boton.secundario}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className={boton.primario}>
              {enviando ? "Vinculando..." : "Vincular"}
            </button>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
