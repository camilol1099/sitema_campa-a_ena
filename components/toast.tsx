"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Aviso flotante (toast): vidrio oscuro abajo al centro. Se usa para confirmar
// que algo se guardó ("Cambios guardados", "Persona vinculada").

const Contexto = createContext<(mensaje: string) => void>(() => {});

export const useToast = () => useContext(Contexto);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const h = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrar = useCallback((m: string) => {
    setMensaje(m);
    clearTimeout(h.current);
    h.current = setTimeout(() => setMensaje(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(h.current), []);

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[22px] z-50 flex justify-center px-4">
        {mensaje && (
          <div className="aparecer rounded-ctl bg-[rgba(16,32,14,.88)] px-[18px] py-3 text-white shadow-[0_12px_30px_rgba(0,0,0,.25)] backdrop-blur-[12px]">
            {mensaje}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
