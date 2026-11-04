import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = ["/login"];

// Renueva la sesión en cada petición y manda al login a quien no tenga sesión.
// Es solo la primera barrera (para la experiencia de uso): la protección real
// de los datos es RLS en Supabase.
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No poner código entre createServerClient y getClaims.
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims);

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some(
    (r) => ruta === r || ruta.startsWith(`${r}/`),
  );

  if (!conSesion && !esPublica) {
    return redirigir(request, respuesta, "/login");
  }
  if (conSesion && esPublica) {
    return redirigir(request, respuesta, "/");
  }

  return respuesta;
}

// Redirige conservando las cookies de sesión que se acaban de renovar.
function redirigir(
  request: NextRequest,
  respuesta: NextResponse,
  destino: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  const redireccion = NextResponse.redirect(url);
  respuesta.cookies
    .getAll()
    .forEach((cookie) => redireccion.cookies.set(cookie));
  return redireccion;
}
