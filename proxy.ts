import type { NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  // Todas las rutas excepto archivos estáticos, imágenes y robots.txt
  // (los buscadores deben poder leerlo sin sesión para saber que no deben indexar).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
