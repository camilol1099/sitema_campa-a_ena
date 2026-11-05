"use client";

import { Boton, Vidrio } from "@/components/ui";

export default function ErrorPrivado({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Vidrio fuerte className="max-w-sm rounded-pane p-7 text-center">
        <h1 className="text-[19px] leading-[26px] font-bold">No se pudieron cargar los datos</h1>
        <p className="mt-1 text-muted">Revisa tu conexión e intenta de nuevo.</p>
        <Boton variante="pri" onClick={reset} className="mt-5">
          Intentar de nuevo
        </Boton>
      </Vidrio>
    </main>
  );
}
