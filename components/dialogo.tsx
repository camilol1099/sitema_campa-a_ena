"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Diálogo modal nativo (<dialog>): atrapa el foco y se cierra con Esc.
// Tarjeta de vidrio fuerte centrada sobre un fondo oscurecido con blur.
export function Dialogo({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  ancho = "md",
  children,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  ancho?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === ref.current) alCerrar(); // clic fuera del contenido
      }}
      className={`m-auto w-[calc(100%-24px)] rounded-pane border border-glass-line bg-glass-strong p-0 text-ink shadow-vidrio backdrop-vidrio backdrop:bg-[rgba(16,32,14,.35)] backdrop:backdrop-blur-[6px] ${
        ancho === "lg" ? "max-w-[660px]" : "max-w-[480px]"
      }`}
    >
      {abierto && (
        <div className="aparecer flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-[22px] pt-5 pb-3">
            <div>
              <h2 className="text-[19px] leading-[26px] font-bold tracking-[-.01em]">{titulo}</h2>
              {descripcion && <p className="text-[13px] text-muted">{descripcion}</p>}
            </div>
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="-mr-1 flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[12px] bg-neu text-muted shadow-neu-out-sm transition hover:text-ink active:shadow-neu-in"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
          <div className="overflow-auto px-[22px] pt-1 pb-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
