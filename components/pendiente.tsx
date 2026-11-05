"use client";

import { useLinkStatus } from "next/link";

// Punto que late mientras se abre el enlace (va dentro de un <Link>).
export default function Pendiente() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 right-2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-2 transition-opacity ${
        pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"
      }`}
    />
  );
}
