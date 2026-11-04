import type { ReactNode } from "react";

const CONTROL =
  "h-9 w-full rounded-md border border-control bg-surface px-2.5 text-[14px] text-ink outline-none transition " +
  "hover:border-muted focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-warn-ink";

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
    <label
      className={`flex min-w-0 flex-col gap-1 ${ancho === "completo" ? "sm:col-span-2" : ""}`}
    >
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

type PropsTexto = React.InputHTMLAttributes<HTMLInputElement> & {
  invalido?: boolean;
};
export function Texto({ invalido, className = "", ...props }: PropsTexto) {
  return (
    <input
      {...props}
      aria-invalid={invalido || undefined}
      className={`${CONTROL} ${className}`}
    />
  );
}

type PropsSelect = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalido?: boolean;
};
export function Seleccion({ invalido, className = "", ...props }: PropsSelect) {
  return (
    <select
      {...props}
      aria-invalid={invalido || undefined}
      className={`${CONTROL} cursor-pointer ${className}`}
    />
  );
}

export function AreaTexto(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea rows={2} {...props} className={`${CONTROL} h-auto py-2`} />;
}

export function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="mt-5 first:mt-0">
      <legend className="mb-2 text-[13px] font-semibold text-muted">
        {titulo}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// Mensaje general del formulario (error de guardado, aviso, etc.)
export function Aviso({
  children,
  tono = "aviso",
}: {
  children: ReactNode;
  tono?: "aviso" | "nota";
}) {
  return (
    <div
      role={tono === "aviso" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-[13px] ${
        tono === "nota"
          ? "border-note-ink/20 bg-note text-note-ink"
          : "border-warn-ink/20 bg-warn text-warn-ink"
      }`}
    >
      {children}
    </div>
  );
}
