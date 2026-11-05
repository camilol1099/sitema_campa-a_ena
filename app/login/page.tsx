import type { Metadata } from "next";
import Image from "next/image";
import foto from "@/public/marca/foto-ahora-nosotros.webp";
import imagotipo from "@/public/marca/imagotipo-blanco.png";
import FormularioLogin from "./formulario";

export const metadata: Metadata = {
  title: "Iniciar sesión · Campaña Jesús Perpiñán",
};

export default function PaginaLogin() {
  return (
    <main className="relative isolate grid min-h-screen flex-1 grid-cols-[minmax(0,1.25fr)_minmax(400px,.75fr)] overflow-hidden text-white max-[980px]:grid-cols-1">
      {/* Foto #AhoraNosotros de fondo, cubierta por un degradado verde oscuro */}
      <Image
        src={foto}
        alt=""
        fill
        priority
        sizes="100vw"
        placeholder="blur"
        className="-z-20 scale-[1.04] object-cover object-[38%_30%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(14,34,13,.92)_0%,rgba(20,48,18,.78)_38%,rgba(33,72,32,.45)_62%,rgba(16,40,15,.82)_100%),radial-gradient(40vw_40vw_at_85%_15%,rgba(72,167,51,.35),transparent_60%)]"
      />

      <div className="flex flex-col justify-between px-16 py-14 max-[980px]:min-h-[44vh] max-[980px]:px-7 max-[980px]:pt-8 max-[980px]:pb-0">
        <Image
          src={imagotipo}
          alt="Jesús Perpiñán, Concejal de Valledupar"
          priority
          className="h-auto w-[min(420px,80%)] drop-shadow-[0_8px_24px_rgba(0,0,0,.35)]"
        />
        <div className="max-w-[520px] max-[980px]:mt-7">
          <p className="text-[clamp(34px,4.4vw,60px)] leading-[1.02] font-extrabold tracking-[-.02em]">
            <span className="text-[#9be07f]">#</span>AhoraNosotros
          </p>
          <p className="mt-4 max-w-[42ch] text-[16px] leading-[26px] text-white/82">
            Toda la información de la campaña en un solo lugar: líderes, empresarios, aliados y su gente.
          </p>
        </div>
        <p className="text-[13px] text-white/66 max-[980px]:hidden">Acceso privado del equipo de campaña.</p>
      </div>

      <div className="flex items-center justify-center px-12 py-10 max-[980px]:items-start max-[980px]:px-[18px] max-[980px]:pt-6 max-[980px]:pb-10">
        <FormularioLogin />
      </div>
    </main>
  );
}
