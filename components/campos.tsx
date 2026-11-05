import type { ReactNode } from "react";

// Campos de formulario neomórficos: hundidos sobre --neu-bg.
const CONTROL =
  "h-[42px] w-full rounded-ctl bg-neu px-3.5 text-[14px] text-ink shadow-neu-in outline-none transition " +
  "placeholder:text-faint focus:ring-2 focus:ring-brand-2/55 " +
  "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-warn-ink/50";

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  ancho = "medio",
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  children: ReactNode;
  ancho?: "medio" | "completo";
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${ancho === "completo" ? "sm:col-span-2" : ""}`}>
      <span className="text-[13px] font-medium text-muted">{etiqueta}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[12px] font-medium text-warn-ink">
          {error}
        </span>
      ) : ayuda ? (
        <span className="text-[12px] text-faint">{ayuda}</span>
      ) : null}
    </label>
  );
}

type PropsTexto = React.InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean };
export function Texto({ invalido, className = "", ...props }: PropsTexto) {
  return <input {...props} aria-invalid={invalido || undefined} className={`${CONTROL} ${className}`} />;
}

type PropsSelect = React.SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean };
export function Seleccion({ invalido, className = "", ...props }: PropsSelect) {
  return <select {...props} aria-invalid={invalido || undefined} className={`${CONTROL} cursor-pointer ${className}`} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${CONTROL} h-auto py-2.5`} />;
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="mt-5 first:mt-0">
      <legend className="mb-2.5 text-[12px] font-bold tracking-[.06em] text-muted uppercase">{titulo}</legend>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// Mensaje general del formulario (error de guardado, aviso, etc.)
export function Aviso({ children, tono = "aviso" }: { children: ReactNode; tono?: "aviso" | "nota" }) {
  return (
    <div
      role={tono === "aviso" ? "alert" : "status"}
      className={`rounded-ctl px-3 py-2.5 text-[13px] ${tono === "nota" ? "bg-note text-note-ink" : "bg-warn text-warn-ink"}`}
    >
      {children}
    </div>
  );
}
