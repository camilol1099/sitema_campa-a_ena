"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  guardarPersona,
  guardarReferente,
  type Resultado,
} from "@/app/(privado)/acciones";
import { CAMPOS_TIPO, EJES, VERIFICACIONES, nombreTipo, slugDeTipo, type TipoReferente } from "@/lib/ejes";
import type { Persona, ReferenteEdicion, ReferenteResumen } from "@/lib/tipos";
import { leerCatalogo, type Catalogo, type Catalogos } from "@/lib/catalogos";
import { erroresCedula } from "@/lib/validacion";
import { AreaTexto, Aviso, Campo, Seccion, Seleccion, Texto } from "./campos";
import { ListaCatalogo, useCatalogos } from "./catalogo";
import { useToast } from "./toast";
import { claseBoton } from "./ui";

// Envía el formulario sin que React lo limpie (si hay errores, los datos se conservan).
function useEnvio(
  accion: (fd: FormData) => Promise<Resultado>,
  alTerminar: (r: Resultado) => void,
  validar?: (fd: FormData) => Record<string, string>,
) {
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Si hay un error, se lleva a la vista (el botón está abajo y el aviso arriba).
  useEffect(() => {
    if (!estado || estado.ok) return;
    const primero = formRef.current?.querySelector<HTMLElement>('[role="alert"], [role="status"]');
    primero?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus({ preventScroll: true });
  }, [estado]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errores = validar?.(fd) ?? {};
    if (Object.keys(errores).length) {
      setEstado({ ok: false, errores });
      return;
    }
    iniciar(async () => {
      const r = await accion(fd);
      setEstado(r);
      if (r.ok) alTerminar(r);
    });
  }

  return { estado, enviando, enviar, formRef, errores: estado?.errores ?? {} };
}

// Validación en el navegador: cédula y campos de lista (barrio, municipio, puesto).
// El servidor vuelve a validar todo.
function validador(catalogos: Catalogos, cats: Catalogo[]) {
  return (fd: FormData) => {
    const errores = erroresCedula(fd);
    for (const c of cats) {
      const r = leerCatalogo(fd, c, catalogos[c]);
      if (r.error) errores[c] = r.error;
    }
    return errores;
  };
}

// Mensaje de "ya existe": ofrece abrir el registro en vez de duplicarlo.
function YaExiste({ r, alAbrir }: { r: Resultado | null; alAbrir: () => void }) {
  if (!r?.existente) return null;
  return (
    <Aviso tono="nota">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Esta cédula ya es de <b className="font-medium">{r.existente.nombre}</b>.
        </span>
        <Link href={r.existente.href} onClick={alAbrir} className={claseBoton("sec", "sm")}>
          Abrir a {r.existente.nombre.split(" ")[0]}
        </Link>
      </div>
    </Aviso>
  );
}

function Pie({
  enviando,
  alCancelar,
  texto,
}: {
  enviando: boolean;
  alCancelar: () => void;
  texto: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-linea pt-4">
      <button type="button" onClick={alCancelar} className={claseBoton("sec")}>
        Cancelar
      </button>
      <button type="submit" disabled={enviando} className={claseBoton("pri")}>
        {enviando ? "Guardando..." : texto}
      </button>
    </div>
  );
}

// Verificación del municipio (persona y referente).
function CampoVerificacion({ valor, error }: { valor?: string | null; error?: string }) {
  return (
    <Campo etiqueta="Verificación" error={error} ancho="completo">
      <Seleccion name="municipio_verificacion" defaultValue={valor ?? ""}>
        <option value="">Sin verificar</option>
        {VERIFICACIONES.map((op) => (
          <option key={op} value={op}>
            {op === "Valledupar" ? "Vota en Valledupar" : op}
          </option>
        ))}
      </Seleccion>
    </Campo>
  );
}

// ---------------------------------------------------------------------------
// Referente (líder, empresario o aliado)
// ---------------------------------------------------------------------------
export function FormReferente({
  tipo,
  referente,
  alCerrar,
}: {
  tipo: TipoReferente;
  referente?: ReferenteEdicion;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const avisar = useToast();
  const catalogos = useCatalogos();
  const { estado, enviando, enviar, errores, formRef } = useEnvio(
    guardarReferente,
    (r) => {
      alCerrar();
      avisar(referente ? "Cambios guardados" : `${nombreTipo(tipo)} creado`);
      if (!referente && r.href) router.push(r.href);
    },
    validador(catalogos, ["barrio", "municipio", "puesto_votacion"]),
  );
  const v = referente;

  return (
    <form ref={formRef} onSubmit={enviar} noValidate>
      <input type="hidden" name="tipo" value={tipo} />
      {v && <input type="hidden" name="id" value={v.id} />}

      <div className="flex flex-col gap-3">
        <YaExiste r={estado} alAbrir={alCerrar} />
        {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      </div>

      <Seccion titulo="Datos">
        <Campo etiqueta="Nombre completo *" error={errores.nombre} ancho="completo">
          <Texto name="nombre" defaultValue={v?.nombre} required autoFocus invalido={!!errores.nombre} />
        </Campo>
        <Campo etiqueta="Cédula" error={errores.cedula} ayuda="Solo números">
          <Texto name="cedula" defaultValue={v?.cedula ?? ""} inputMode="numeric" autoComplete="off" invalido={!!errores.cedula} />
        </Campo>
        <Campo etiqueta="Barrio" error={errores.barrio}>
          <ListaCatalogo cat="barrio" defaultValue={v?.barrio} invalido={!!errores.barrio} />
        </Campo>
        <Campo etiqueta="Municipio" error={errores.municipio}>
          <ListaCatalogo cat="municipio" defaultValue={v ? v.municipio : "Valledupar"} invalido={!!errores.municipio} />
        </Campo>
      </Seccion>

      <Seccion titulo="Votación">
        <CampoVerificacion valor={v?.municipio_verificacion} error={errores.municipio_verificacion} />
        <Campo etiqueta="Puesto de votación" error={errores.puesto_votacion}>
          <ListaCatalogo cat="puesto_votacion" defaultValue={v?.puesto_votacion} invalido={!!errores.puesto_votacion} />
        </Campo>
        <Campo etiqueta="Mesa" error={errores.mesa}>
          <Texto name="mesa" defaultValue={v?.mesa ?? ""} inputMode="numeric" invalido={!!errores.mesa} />
        </Campo>
        <Campo etiqueta="Coordinador" error={errores.coordinador} ancho="completo">
          <Texto name="coordinador" defaultValue={v?.coordinador ?? ""} maxLength={120} invalido={!!errores.coordinador} />
        </Campo>
      </Seccion>

      {CAMPOS_TIPO[tipo].length > 0 && (
        <Seccion titulo={tipo === "empresario" ? "Empresa" : "Política"}>
          {CAMPOS_TIPO[tipo].map(({ campo, etiqueta }) => (
            <Campo key={campo} etiqueta={etiqueta} error={errores[campo]} ancho="completo">
              <Texto name={campo} defaultValue={v?.[campo] ?? ""} maxLength={120} invalido={!!errores[campo]} />
            </Campo>
          ))}
        </Seccion>
      )}

      <Seccion titulo="Contacto (no se muestra en la ficha)">
        <Campo etiqueta="Celular">
          <Texto name="celular" defaultValue={v?.celular ?? ""} inputMode="tel" />
        </Campo>
        <Campo etiqueta="Dirección">
          <Texto name="direccion" defaultValue={v?.direccion ?? ""} />
        </Campo>
      </Seccion>

      <Pie enviando={enviando} alCancelar={alCerrar} texto={v ? "Guardar cambios" : `Crear ${EJES[slugDeTipo(tipo)].uno}`} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------
export function FormPersona({
  persona,
  referentes,
  referenteInicial,
  nombreInicial,
  alCerrar,
}: {
  persona?: Persona;
  // Solo al crear: referentes a los que se puede vincular de una vez.
  referentes?: ReferenteResumen[];
  referenteInicial?: string;
  nombreInicial?: string;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const avisar = useToast();
  const catalogos = useCatalogos();
  const { estado, enviando, enviar, errores, formRef } = useEnvio(
    guardarPersona,
    (r) => {
      alCerrar();
      avisar(persona ? "Cambios guardados" : "Persona creada");
      if (!persona && r.href) router.push(r.href);
    },
    validador(catalogos, ["barrio", "puesto_votacion"]),
  );
  const v = persona;
  const [autorizo, setAutorizo] = useState(v?.autorizacion_datos ?? false);

  return (
    <form ref={formRef} onSubmit={enviar} noValidate>
      {v && <input type="hidden" name="id" value={v.id} />}

      <div className="flex flex-col gap-3">
        <YaExiste r={estado} alAbrir={alCerrar} />
        {estado?.mensaje && <Aviso>{estado.mensaje}</Aviso>}
      </div>

      <Seccion titulo="Datos personales">
        <Campo etiqueta="Nombre completo *" error={errores.nombre} ancho="completo">
          <Texto name="nombre" defaultValue={v?.nombre ?? nombreInicial} required autoFocus invalido={!!errores.nombre} />
        </Campo>
        <Campo etiqueta="Cédula" error={errores.cedula} ayuda="Solo números">
          <Texto name="cedula" defaultValue={v?.cedula ?? ""} inputMode="numeric" autoComplete="off" invalido={!!errores.cedula} />
        </Campo>
        <Campo etiqueta="Celular">
          <Texto name="celular" defaultValue={v?.celular ?? ""} inputMode="tel" />
        </Campo>
        <Campo etiqueta="Dirección">
          <Texto name="direccion" defaultValue={v?.direccion ?? ""} />
        </Campo>
        <Campo etiqueta="Barrio" error={errores.barrio}>
          <ListaCatalogo cat="barrio" defaultValue={v?.barrio} invalido={!!errores.barrio} />
        </Campo>
      </Seccion>

      <Seccion titulo="Votación">
        <CampoVerificacion valor={v?.municipio_verificacion} error={errores.municipio_verificacion} />
        <Campo etiqueta="Puesto de votación" error={errores.puesto_votacion}>
          <ListaCatalogo cat="puesto_votacion" defaultValue={v?.puesto_votacion} invalido={!!errores.puesto_votacion} />
        </Campo>
        <Campo etiqueta="Mesa" error={errores.mesa}>
          <Texto name="mesa" defaultValue={v?.mesa ?? ""} inputMode="numeric" invalido={!!errores.mesa} />
        </Campo>
      </Seccion>

      <Seccion titulo="Autorización y notas">
        <label className="flex cursor-pointer items-center gap-2.5 rounded-ctl bg-neu px-3.5 py-2.5 shadow-neu-out-sm transition sm:col-span-2">
          <input
            type="checkbox"
            name="autorizacion_datos"
            checked={autorizo}
            onChange={(e) => setAutorizo(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span>Autorizó el tratamiento de sus datos (Ley 1581)</span>
        </label>
        {autorizo && (
          <Campo etiqueta="Fecha de autorización" error={errores.fecha_autorizacion} ayuda="Si la dejas vacía, se usa la de hoy">
            <Texto type="date" name="fecha_autorizacion" defaultValue={v?.fecha_autorizacion?.slice(0, 10) ?? ""} />
          </Campo>
        )}
        <Campo etiqueta="Observaciones" ancho="completo">
          <AreaTexto name="observaciones" defaultValue={v?.observaciones ?? ""} />
        </Campo>
      </Seccion>

      {!v && referentes && (
        <Seccion titulo="Vincular a un referente (opcional)">
          <Campo etiqueta="Referente" error={errores.referente_id}>
            <SelectorReferente referentes={referentes} defaultValue={referenteInicial ?? ""} />
          </Campo>
          <Campo etiqueta="Coordinador">
            <Texto name="coordinador" />
          </Campo>
        </Seccion>
      )}

      <Pie enviando={enviando} alCancelar={alCerrar} texto={v ? "Guardar cambios" : "Crear persona"} />
    </form>
  );
}

// Lista de referentes agrupada por eje.
export function SelectorReferente({
  referentes,
  defaultValue,
  excluir = [],
  requerido = false,
}: {
  referentes: ReferenteResumen[];
  defaultValue?: string;
  excluir?: string[];
  requerido?: boolean;
}) {
  return (
    <Seleccion name="referente_id" defaultValue={defaultValue} required={requerido}>
      <option value="">{requerido ? "Elige un referente" : "Sin referente"}</option>
      {Object.values(EJES).map((eje) => (
        <optgroup key={eje.tipo} label={eje.titulo}>
          {referentes
            .filter((r) => r.tipo === eje.tipo && !excluir.includes(r.id))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
        </optgroup>
      ))}
    </Seleccion>
  );
}
