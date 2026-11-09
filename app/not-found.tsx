import Link from "next/link";
import { claseBoton } from "@/components/ui";

// Página para direcciones que no existen (en español, como el resto del sistema).
export default function NoEncontrada() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-[30px] leading-[38px] font-bold tracking-[-.02em]">Esta página no existe</h1>
      <p className="max-w-[46ch] text-muted">Puede que la dirección esté mal escrita o que el registro ya no exista.</p>
      <Link href="/panel" className={`${claseBoton("pri")} mt-2`}>
        Ir al panel
      </Link>
    </main>
  );
}
