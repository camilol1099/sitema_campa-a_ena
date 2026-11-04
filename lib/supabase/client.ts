import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes que corren en el navegador.
// Solo usa la llave pública: los datos los protege RLS en la base de datos.
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
