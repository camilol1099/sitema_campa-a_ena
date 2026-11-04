"use client";

import { boton } from "@/components/ui";

export default function ErrorPrivado({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
        <h1 className="text-[16px] font-semibold">No se pudieron cargar los datos</h1>
        <p className="mt-1 text-muted">Revisa tu conexión e intenta de nuevo.</p>
        <button type="button" onClick={reset} className={`${boton.primario} mt-4`}>
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
