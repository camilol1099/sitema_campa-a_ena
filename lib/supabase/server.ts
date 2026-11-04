import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para el servidor (componentes de servidor y acciones).
// Usa la sesión del usuario guardada en cookies; nunca la service_role key.
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Desde un componente de servidor no se pueden escribir cookies;
            // el proxy se encarga de renovar la sesión.
          }
        },
      },
    },
  );
}
