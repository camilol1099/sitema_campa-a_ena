"use client";

import Image from "next/image";
import { useActionState, useState, type ReactNode } from "react";
import isotipo from "@/public/marca/isotipo-blanco.png";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const estadoInicial: EstadoLogin = { error: null };

const ico = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Campo hundido sobre el vidrio oscuro, con ícono a la izquierda.
function CampoLogin({ id, etiqueta, icono, children }: { id: string; etiqueta: string; icono: ReactNode; children: ReactNode }) {
  return (
    <>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-white/90">
        {etiqueta}
      </label>
      <div className="relative mb-4">
        <span className="pointer-events-none absolute top-1/2 left-[15px] -translate-y-1/2 opacity-75">{icono}</span>
        {children}
      </div>
    </>
  );
}

const ENTRADA =
  "h-[50px] w-full rounded-[16px] border border-white/22 bg-[rgba(8,24,7,.35)] px-[46px] text-white outline-none " +
  "shadow-[inset_2px_2px_6px_rgba(0,0,0,.35),inset_-1px_-1px_0_rgba(255,255,255,.08)] transition placeholder:text-white/50 " +
  "focus:border-[rgba(155,224,127,.9)] focus:shadow-[inset_2px_2px_6px_rgba(0,0,0,.35),0_0_0_3px_rgba(72,167,51,.35)]";

export default function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);
  const [ver, setVer] = useState(false);

  return (
    <form
      action={accion}
      className="w-full max-w-[420px] rounded-[28px] border border-white/28 bg-white/12 px-[34px] pt-9 pb-[30px] shadow-[0_30px_60px_-20px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.35)] backdrop-blur-[26px] backdrop-saturate-150 max-[420px]:px-6"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-card bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_8px_18px_-8px_rgba(0,0,0,.4)]">
        <Image src={isotipo} alt="" className="h-[38px] w-[38px]" />
      </div>
      <h1 className="mt-5 mb-1 text-[26px] leading-[34px] font-bold tracking-[-.01em]">Bienvenida de nuevo</h1>
      <p className="mb-6 text-white/75">Ingrese con su correo y contraseña.</p>

      {estado.error && (
        <div role="alert" className="-mt-1 mb-3.5 rounded-[12px] border border-accent/45 bg-accent/22 px-3 py-2.5 text-[13px]">
          {estado.error}
        </div>
      )}

      <CampoLogin
        id="correo"
        etiqueta="Correo"
        icono={
          <svg {...ico}>
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        }
      >
        <input id="correo" name="correo" type="email" autoComplete="username" placeholder="nombre@correo.com" required className={ENTRADA} />
      </CampoLogin>

      <CampoLogin
        id="contrasena"
        etiqueta="Contraseña"
        icono={
          <svg {...ico}>
            <rect x="4" y="10" width="16" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        }
      >
        <input
          id="contrasena"
          name="contrasena"
          type={ver ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••••"
          required
          className={ENTRADA}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={ver}
          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[12px] text-white opacity-75 transition hover:bg-white/10 hover:opacity-100"
        >
          <svg {...ico}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {ver && <path d="M4 20 20 4" />}
          </svg>
        </button>
      </CampoLogin>

      <button
        type="submit"
        disabled={enviando}
        className="mt-1.5 inline-flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#5cc341,#2f7a26_55%,#214820)] text-[15px] font-semibold text-white shadow-[0_14px_26px_-10px_rgba(72,167,51,.7),inset_0_1px_0_rgba(255,255,255,.4)] transition hover:-translate-y-px hover:brightness-107 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {enviando ? "Ingresando..." : "Ingresar"}
        {!enviando && (
          <svg {...ico} strokeWidth={2}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>

      <p className="mt-[18px] flex gap-2 text-[12.5px] leading-[18px] text-white/62">
        <svg {...ico} width={16} height={16} className="mt-px flex-none">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
        </svg>
        Información protegida. Solo personas autorizadas por la campaña.
      </p>
    </form>
  );
}
