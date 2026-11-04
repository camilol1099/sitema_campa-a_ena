"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Diálogo modal nativo (<dialog>): atrapa el foco y se cierra con Esc.
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
      className={`m-auto w-[calc(100%-32px)] rounded-lg border border-border bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgba(20,26,18,.45)] backdrop:bg-ink/30 ${
        ancho === "lg" ? "max-w-[640px]" : "max-w-[460px]"
      }`}
    >
      {abierto && (
        <div className="aparecer flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 pt-4 pb-3">
            <div>
              <h2 className="text-[16px] font-semibold leading-6">{titulo}</h2>
              {descripcion && (
                <p className="text-[13px] text-muted">{descripcion}</p>
              )}
            </div>
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="-mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted transition hover:border-control hover:bg-raised hover:text-ink"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
          <div className="overflow-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
