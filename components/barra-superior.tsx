"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cerrarSesion } from "@/app/login/acciones";
import { EJES, SLUGS, nombreTipo, slugDeTipo, type SlugEje } from "@/lib/ejes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ResultadoBusqueda } from "@/lib/tipos";
import { IconoBuscar } from "./ui";

function Marca() {
  return (
    <Link href="/lideres" className="flex flex-none items-center gap-2.5 rounded-md">
      <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="#214820" />
        <path d="M17 7v20M17 13l-6-4M17 13l6-4M17 19l-7-3M17 19l7-3" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="17" cy="27" r="2" fill="#48a733" />
      </svg>
      <span className="hidden font-semibold leading-4 sm:block">Jesús Perpiñán</span>
    </Link>
  );
}

// Pestañas de los ejes: con borde y color, no solo texto.
function Pestanas({ conteos }: { conteos: Record<SlugEje, number> }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Ejes de la campaña" className="flex gap-1.5 overflow-x-auto max-[859px]:order-4 max-[859px]:w-full max-[859px]:pb-2">
      {SLUGS.map((slug) => {
        const activa = ruta === `/${slug}`;
        return (
          <Link
            key={slug}
            href={`/${slug}`}
            aria-current={activa ? "page" : undefined}
            className={`flex h-9 flex-none items-center gap-2 rounded-md border px-3 transition duration-150 motion-safe:hover:-translate-y-px ${
              activa
                ? "border-ink bg-ink font-medium text-white"
                : "border-control bg-surface text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {EJES[slug].titulo}
            <span className={`num rounded-full px-1.5 text-[12px] leading-[18px] ${activa ? "bg-white/20 text-white" : "bg-active text-muted"}`}>
              {conteos[slug]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

const hrefDe = (p: ResultadoBusqueda) =>
  p.referente_id && p.referente_tipo
    ? `/${slugDeTipo(p.referente_tipo)}?referente=${p.referente_id}&persona=${p.id}`
    : `/lideres?persona=${p.id}`;

// Buscador global: nombre o últimos dígitos de cédula. Atajo "/".
function Buscador() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null);
  const [marcado, setMarcado] = useState(0);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        entrada.current?.focus();
      }
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, []);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) return;
    let vigente = true;
    const h = setTimeout(async () => {
      const { data } = await crearClienteNavegador().rpc("buscar_personas", { p_texto: t });
      if (vigente) {
        setResultados((data as ResultadoBusqueda[]) ?? []);
        setMarcado(0);
      }
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(h);
    };
  }, [texto]);

  function abrir(p: ResultadoBusqueda) {
    setTexto("");
    setResultados(null);
    setAbierto(false);
    entrada.current?.blur();
    router.push(hrefDe(p));
  }

  // Con menos de 2 letras no se muestran resultados (pueden ser de una búsqueda anterior).
  const vigentes = texto.trim().length >= 2 ? resultados : null;
  const lista = abierto && vigentes;

  return (
    <div className="relative ml-auto w-[300px] max-[859px]:order-3 max-[859px]:ml-0 max-[859px]:w-full">
      <label className="flex h-9 items-center gap-2 rounded-md border border-control bg-surface px-2.5 text-muted transition hover:border-muted focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <IconoBuscar />
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (!vigentes?.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMarcado((m) => Math.min(m + 1, vigentes.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setMarcado((m) => Math.max(m - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              abrir(vigentes[marcado]!);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          placeholder="Buscar persona o cédula"
          aria-label="Buscar persona o cédula"
          role="combobox"
          aria-expanded={!!lista}
          aria-controls="resultados-busqueda"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none"
        />
        <kbd className="rounded border border-border px-1.5 text-[11px] text-muted">/</kbd>
      </label>
      {lista && (
        <ul
          id="resultados-busqueda"
          role="listbox"
          className="aparecer absolute right-0 left-0 z-20 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(20,26,18,.4)]"
        >
          {vigentes.length === 0 && <li className="px-3 py-2 text-muted">No se encontró a nadie.</li>}
          {vigentes.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === marcado}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => abrir(p)}
                onMouseEnter={() => setMarcado(i)}
                className={`w-full cursor-pointer rounded-md px-3 py-2 text-left transition ${i === marcado ? "bg-active" : ""}`}
              >
                <div className="truncate font-medium">{p.nombre}</div>
                <div className="truncate text-[13px] text-muted">
                  {p.cedula_final ? `•••• ${p.cedula_final}` : "Sin cédula"}
                  {p.referente_tipo ? ` · ${nombreTipo(p.referente_tipo)}: ${p.referente_nombre}` : " · Sin referente"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuUsuario({ correo }: { correo: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative flex-none max-[859px]:ml-auto">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-label="Menú de la cuenta"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-control bg-active text-[12px] font-semibold transition hover:border-ink motion-safe:hover:scale-105"
      >
        {correo.slice(0, 2).toUpperCase()}
      </button>
      {abierto && (
        <div className="aparecer absolute right-0 z-20 mt-2 w-60 rounded-lg border border-border bg-surface p-2 shadow-[0_16px_40px_-16px_rgba(20,26,18,.4)]">
          <p className="truncate px-2 py-1 text-[13px] text-muted">{correo}</p>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="mt-1 w-full cursor-pointer rounded-md border border-control px-2 py-1.5 text-left transition hover:border-ink hover:bg-raised"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function BarraSuperior({
  conteos,
  correo,
}: {
  conteos: Record<SlugEje, number>;
  correo: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[60px] items-center gap-6 border-b border-border bg-surface px-6 max-[859px]:h-auto max-[859px]:flex-wrap max-[859px]:gap-3 max-[859px]:px-4 max-[859px]:pt-2">
      <Marca />
      <Pestanas conteos={conteos} />
      <Buscador />
      <MenuUsuario correo={correo} />
    </header>
  );
}
