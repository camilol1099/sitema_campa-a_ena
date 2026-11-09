"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { arreglarPersona, eliminarPersona, type Resultado } from "@/app/(privado)/acciones";
import type { PersonaRevision, Revision } from "@/lib/datos";
import { rutaPersona } from "@/lib/rutas";
import type { ReferenteResumen } from "@/lib/tipos";
import { AreaTexto, Aviso, Campo, Texto } from "./campos";
import { Dialogo } from "./dialogo";
import { SelectorReferente } from "./formularios";
import { useToast } from "./toast";
import { Boton, Filtros, Pildora, Vacio, Vidrio } from "./ui";

// Panel de Revisión: personas que el sistema no supo resolver solo. Se corrigen
// ahí mismo y se guardan con las mismas validaciones del sistema.

type Grupo = "sinLider" | "cedulaInvalida" | "repetidaExcel";

const GRUPOS: Record<Grupo, { titulo: string; explicacion: string }> = {
  sinLider: {
    titulo: "Sin líder",
    explicacion: "Están con «Sin líder asignado». Elija su líder y guarde: salen de esta lista.",
  },
  cedulaInvalida: {
    titulo: "Cédula no válida",
    explicacion: "La cédula no tiene entre 6 y 10 dígitos. Corríjala, o déjela vacía si no la conoce.",
  },
  repetidaExcel: {
    titulo: "Cédula repetida en el Excel",
    explicacion:
      "En el Excel su cédula ya era de otra persona, por eso quedaron sin cédula. Escriba la cédula correcta; si es la misma persona que la otra, bórrela; si es otra persona, quite el aviso.",
  },
};

function FilaRevision({ p, grupo, referentes, sinLiderId }: { p: PersonaRevision; grupo: Grupo; referentes: ReferenteResumen[]; sinLiderId: string | null }) {
  const router = useRouter();
  const avisar = useToast();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardando, iniciar] = useTransition();
  const [borrar, setBorrar] = useState(false);
  const errores = resultado?.errores ?? {};
  const lideres = p.referentes.filter((r) => r.id !== sinLiderId);

  function enviar(form: HTMLFormElement, quitarAviso = false) {
    const fd = new FormData(form);
    if (quitarAviso) fd.set("quitar_aviso", "1");
    if (grupo === "sinLider" && !fd.get("referente_id")) {
      setResultado({ ok: false, errores: { referente_id: "Elija el líder de esta persona." } });
      return;
    }
    iniciar(async () => {
      const r = await arreglarPersona(fd);
      setResultado(r);
      if (r.ok) {
        avisar(`${p.nombre}: cambios guardados`);
        router.refresh();
      }
    });
  }

  return (
    <li className="rounded-card bg-white/80 p-4 shadow-neu-out-sm">
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          enviar(e.currentTarget);
        }}
        noValidate
      >
        <input type="hidden" name="id" value={p.id} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={rutaPersona(p.id, null)} className="text-[15px] font-bold hover:text-brand">
            {p.nombre}
          </Link>
          {lideres.length ? lideres.map((r) => <Pildora key={r.id}>{r.nombre}</Pildora>) : <Pildora tono="aviso">Sin líder</Pildora>}
          {p.barrio && <span className="text-[13px] text-muted">{p.barrio}</span>}
        </div>

        {resultado?.mensaje && <Aviso>{resultado.mensaje}</Aviso>}

        <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
          <Campo etiqueta="Nombre *" error={errores.nombre}>
            <Texto name="nombre" defaultValue={p.nombre} invalido={!!errores.nombre} />
          </Campo>
          <Campo etiqueta="Cédula" error={errores.cedula} ayuda="De 6 a 10 dígitos; puede llevar puntos">
            <Texto name="cedula" defaultValue={p.cedula ?? ""} inputMode="numeric" autoComplete="off" invalido={!!errores.cedula} />
          </Campo>
          <Campo etiqueta="Celular">
            <Texto name="celular" defaultValue={p.celular ?? ""} inputMode="tel" />
          </Campo>
          <Campo etiqueta="Dirección">
            <Texto name="direccion" defaultValue={p.direccion ?? ""} />
          </Campo>
          <Campo etiqueta={grupo === "sinLider" ? "Líder *" : "Agregar a otro líder (opcional)"} error={errores.referente_id}>
            <SelectorReferente referentes={referentes} excluir={[...(sinLiderId ? [sinLiderId] : []), ...lideres.map((r) => r.id)]} />
          </Campo>
          <Campo etiqueta="Observaciones">
            <AreaTexto name="observaciones" defaultValue={p.observaciones ?? ""} rows={2} />
          </Campo>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {grupo === "repetidaExcel" && (
            <>
              <Boton tam="sm" onClick={() => setBorrar(true)} disabled={guardando}>
                Es la misma persona: borrar
              </Boton>
              <Boton
                tam="sm"
                disabled={guardando}
                onClick={(e) => {
                  const form = e.currentTarget.form;
                  if (form) enviar(form, true);
                }}
              >
                Es otra persona: quitar aviso
              </Boton>
            </>
          )}
          <Boton type="submit" variante="pri" tam="sm" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </Boton>
        </div>
      </form>

      <Dialogo abierto={borrar} alCerrar={() => setBorrar(false)} titulo={`¿Borrar a ${p.nombre}?`} descripcion="Use esto solo si es la misma persona que ya está registrada con esa cédula.">
        <p className="text-[14px]">Se borra este registro repetido y sus vínculos. Queda anotado en el historial.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton onClick={() => setBorrar(false)}>Cancelar</Boton>
          <Boton
            variante="pri"
            disabled={guardando}
            onClick={() =>
              iniciar(async () => {
                const r = await eliminarPersona(p.id);
                setBorrar(false);
                setResultado(r);
                if (r.ok) {
                  avisar(`${p.nombre}: registro repetido borrado`);
                  router.refresh();
                }
              })
            }
          >
            Sí, borrar
          </Boton>
        </div>
      </Dialogo>
    </li>
  );
}

export default function PanelRevision({ datos, referentes }: { datos: Revision; referentes: ReferenteResumen[] }) {
  const conteo = (g: Grupo) => datos[g].length;
  const primero = (Object.keys(GRUPOS) as Grupo[]).find((g) => conteo(g) > 0) ?? "sinLider";
  const [grupo, setGrupo] = useState<Grupo>(primero);
  const lista = datos[grupo];

  return (
    <>
      <Filtros
        etiqueta="Qué revisar"
        valor={grupo}
        alCambiar={setGrupo}
        opciones={(Object.keys(GRUPOS) as Grupo[]).map((g) => [g, `${GRUPOS[g].titulo} (${conteo(g)})`])}
        className="mb-3 max-w-[720px] max-[640px]:flex-col"
      />
      <Vidrio fuerte className="rounded-pane p-[18px] max-[859px]:p-3">
        <p className="mb-3 text-[13px] text-muted">{GRUPOS[grupo].explicacion}</p>
        {lista.length === 0 ? (
          <Vacio>No hay nada pendiente aquí.</Vacio>
        ) : (
          <ul className="grid gap-3">
            {lista.map((p) => (
              <FilaRevision key={p.id} p={p} grupo={grupo} referentes={referentes} sinLiderId={datos.sinLiderId} />
            ))}
          </ul>
        )}
      </Vidrio>
    </>
  );
}
