"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const estadoInicial: EstadoLogin = { error: null };

export default function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(
    iniciarSesion,
    estadoInicial,
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-left text-sm font-medium text-zinc-700">
        Correo
        <input
          name="correo"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base font-normal outline-none focus:border-hoja focus:ring-2 focus:ring-hoja/30"
        />
      </label>

      <label className="flex flex-col gap-1 text-left text-sm font-medium text-zinc-700">
        Contraseña
        <input
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base font-normal outline-none focus:border-hoja focus:ring-2 focus:ring-hoja/30"
        />
      </label>

      {estado.error && (
        <p role="alert" className="text-sm font-medium text-alerta">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 rounded-lg bg-verde px-4 py-2.5 font-semibold text-white transition-colors hover:bg-hoja disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
