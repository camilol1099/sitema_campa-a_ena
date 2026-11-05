"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cerrarSesion } from "@/app/login/acciones";
import { EJES, SLUGS, nombreTipo, type SlugEje } from "@/lib/ejes";
import isotipo from "@/public/marca/isotipo-blanco.png";
import { rutaPersona } from "@/lib/rutas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ResultadoBusqueda } from "@/lib/tipos";
import { Boton, IconoBuscar, Pestanas, Vidrio } from "./ui";

function Marca() {
  return (
    <Link href="/panel" className="flex flex-none items-center gap-2.5 rounded-ctl">
      <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-grad shadow-[0_8px_16px_-8px_rgba(33,72,32,.7),inset_0_1px_0_rgba(255,255,255,.35)]">
        <Image src={isotipo} alt="" className="h-7 w-7" />
      </span>
      <span className="hidden sm:block">
        <b className="block text-[14px] leading-4 font-bold tracking-[-.01em]">Jesús Perpiñán</b>
        <span className="block text-[12px] leading-4 text-muted max-[859px]:hidden">Sistema de campaña</span>
      </span>
    </Link>
  );
}

// "Panel" y luego los ejes, con su número de referentes.
function PestanasSecciones({ conteos }: { conteos: Record<SlugEje, number> }) {
  const ruta = usePathname();
  return (
    <Pestanas
      etiqueta="Secciones de la campaña"
      className="max-[859px]:order-4 max-[859px]:w-full"
      items={[
        { href: "/panel", texto: "Panel", activa: ruta === "/panel" },
        ...SLUGS.map((slug) => ({
          href: `/${slug}`,
          texto: EJES[slug].titulo,
          conteo: conteos[slug],
          activa: ruta === `/${slug}`,
        })),
      ]}
    />
  );
}

const hrefDe = (p: ResultadoBusqueda) =>
  rutaPersona(
    p.id,
    p.referente_id && p.referente_tipo ? { id: p.referente_id, tipo: p.referente_tipo } : null,
  );

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
    <div className="relative ml-auto w-[310px] max-[859px]:order-3 max-[859px]:ml-0 max-[859px]:w-full">
      <label className="flex h-[42px] items-center gap-2 rounded-ctl bg-neu px-3 text-muted shadow-neu-in transition focus-within:ring-2 focus-within:ring-brand-2/55">
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
        <kbd className="rounded-md bg-white px-1.5 text-[12px] text-muted shadow-neu-out-sm">/</kbd>
      </label>
      {lista && (
        <ul
          id="resultados-busqueda"
          role="listbox"
          className="aparecer absolute right-0 left-0 z-20 mt-2 max-h-80 overflow-auto rounded-card border border-glass-line bg-glass-strong p-1.5 shadow-vidrio backdrop-vidrio"
        >
          {vigentes.length === 0 && <li className="px-3 py-2 text-muted">No se encontró a nadie.</li>}
          {vigentes.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === marcado}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => abrir(p)}
                onMouseEnter={() => setMarcado(i)}
                className={`w-full cursor-pointer rounded-[12px] px-3 py-2 text-left transition ${i === marcado ? "bg-white shadow-neu-out-sm" : ""}`}
              >
                <div className="truncate font-semibold">{p.nombre}</div>
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
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-ctl bg-neu text-[12px] font-bold text-brand shadow-neu-out-sm transition active:shadow-neu-in"
      >
        {correo.slice(0, 2).toUpperCase()}
      </button>
      {abierto && (
        <div className="aparecer absolute right-0 z-20 mt-2 w-64 rounded-card border border-glass-line bg-glass-strong p-2.5 shadow-vidrio backdrop-vidrio">
          <p className="truncate px-2 py-1 text-[13px] text-muted">{correo}</p>
          <form action={cerrarSesion}>
            <Boton type="submit" tam="sm" className="mt-1 w-full">
              Cerrar sesión
            </Boton>
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
    <div className="franja-barra sticky top-0 z-10 px-[18px] pt-3 max-[859px]:px-2 max-[859px]:pt-2">
      <Vidrio
        como="header"
        barra
        className="flex h-[66px] items-center gap-[22px] rounded-[22px] pr-3 pl-4 max-[859px]:h-auto max-[859px]:flex-wrap max-[859px]:gap-2.5 max-[859px]:p-2.5"
      >
        <Marca />
        <PestanasSecciones conteos={conteos} />
        <Buscador />
        <MenuUsuario correo={correo} />
      </Vidrio>
    </div>
  );
}
