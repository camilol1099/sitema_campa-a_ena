"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import {
  CATALOGOS,
  CATALOGOS_VACIOS,
  SUFIJO_NUEVO,
  buscarEnLista,
  filtrarLista,
  formatearNombre,
  limpiarNombre,
  validarNombreNuevo,
  type Catalogo,
  type Catalogos,
} from "@/lib/catalogos";

// Listas de barrios, municipios y puestos para los formularios.
// Se cargan en el layout privado y se refrescan al guardar.
const Contexto = createContext<Catalogos>(CATALOGOS_VACIOS);

export function CatalogosProvider({ valor, children }: { valor: Catalogos; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useCatalogos = () => useContext(Contexto);

const MAX_VISIBLES = 60;

// Lista desplegable con búsqueda. Se elige de la lista; si lo escrito no
// aparece, se ofrece "Agregar «…» como nuevo". Envía dos campos:
//   {cat}        el nombre elegido o escrito
//   {cat}_nuevo  "1" si se pidió agregarlo como nuevo
export function ListaCatalogo({
  cat,
  defaultValue,
  invalido,
  id,
}: {
  cat: Catalogo;
  defaultValue?: string | null;
  invalido?: boolean;
  id?: string;
}) {
  const lista = useCatalogos()[cat];
  const { uno } = CATALOGOS[cat];
  const base = useId();
  const idLista = `${base}-lista`;

  const [texto, setTexto] = useState(defaultValue ?? "");
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  const limpio = limpiarNombre(texto);
  const exacto = buscarEnLista(lista, texto);
  const opciones = filtrarLista(lista, texto).slice(0, MAX_VISIBLES);
  const puedeAgregar = !!limpio && !exacto && !nuevo;
  const errorNuevo = nuevo ? validarNombreNuevo(limpio, cat) : null;
  // Opciones del desplegable: las de la lista + "agregar" al final.
  const total = opciones.length + (puedeAgregar ? 1 : 0);

  function elegir(nombre: string) {
    setTexto(nombre);
    setNuevo(false);
    setAbierto(false);
  }
  function agregar() {
    setTexto(formatearNombre(limpio));
    setNuevo(true);
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && abierto && total > 0) {
      e.preventDefault();
      if (activo < opciones.length) elegir(opciones[activo]!);
      else agregar();
    } else if (e.key === "Escape" && abierto) {
      e.preventDefault();
      setAbierto(false);
    }
  }

  // Al salir del campo: si coincide con uno de la lista, se usa ese nombre.
  function alSalir(e: React.FocusEvent) {
    if (caja.current?.contains(e.relatedTarget as Node)) return;
    setAbierto(false);
    if (exacto) setTexto(exacto);
  }

  const marcarInvalido = invalido || !!errorNuevo;

  return (
    <div ref={caja} className="relative" onBlur={alSalir}>
      <input type="hidden" name={cat + SUFIJO_NUEVO} value={nuevo ? "1" : ""} />
      <input
        id={id}
        name={cat}
        value={texto}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && total > 0 ? `${base}-op-${activo}` : undefined}
        aria-invalid={marcarInvalido || undefined}
        autoComplete="off"
        placeholder={`Buscar ${uno}`}
        onChange={(e) => {
          setTexto(e.target.value);
          setNuevo(false);
          setAbierto(true);
          setActivo(0);
        }}
        onClick={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={
          "h-[42px] w-full rounded-ctl bg-neu px-3.5 pr-9 text-[14px] text-ink shadow-neu-in outline-none transition " +
          "placeholder:text-faint focus:ring-2 focus:ring-brand-2/55 " +
          "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-warn-ink/50"
        }
      />
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="pointer-events-none absolute top-[14px] right-3.5 text-muted"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>

      {nuevo && (
        <span className={`mt-1 block text-[12px] ${errorNuevo ? "font-medium text-warn-ink" : "text-brand"}`}>
          {errorNuevo ?? `Se agregará «${limpio}» como ${uno} nuevo.`}
        </span>
      )}

      {abierto && total > 0 && (
        <ul
          id={idLista}
          role="listbox"
          aria-label={`Lista de ${uno}s`}
          className="absolute inset-x-0 top-[46px] z-30 max-h-[240px] overflow-auto rounded-ctl border border-glass-line bg-white p-1 shadow-vidrio"
        >
          {opciones.map((op, i) => (
            <li
              key={op}
              id={`${base}-op-${i}`}
              role="option"
              aria-selected={op === exacto}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(op)}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer truncate rounded-[10px] px-3 py-2 text-[14px] ${
                i === activo ? "bg-neu text-brand" : ""
              } ${op === exacto ? "font-semibold" : ""}`}
            >
              {op}
            </li>
          ))}
          {puedeAgregar && (
            <li
              id={`${base}-op-${opciones.length}`}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={agregar}
              onMouseEnter={() => setActivo(opciones.length)}
              className={`cursor-pointer rounded-[10px] px-3 py-2 text-[14px] font-semibold text-brand ${
                activo === opciones.length ? "bg-neu" : ""
              } ${opciones.length ? "mt-1 border-t border-linea" : ""}`}
            >
              + Agregar «{formatearNombre(limpio)}» como {uno} nuevo
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
