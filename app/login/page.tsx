import type { Metadata } from "next";
import FormularioLogin from "./formulario";

export const metadata: Metadata = {
  title: "Iniciar sesión · Campaña Jesús Perpiñán",
};

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm font-medium uppercase tracking-wide text-hoja">
          Concejo de Valledupar
        </p>
        <h1 className="mt-1 text-2xl font-bold text-verde">Jesús Perpiñán</h1>
        <p className="mt-2 mb-6 text-sm text-zinc-600">
          Entra con tu correo y tu contraseña.
        </p>
        <FormularioLogin />
      </div>
    </main>
  );
}
