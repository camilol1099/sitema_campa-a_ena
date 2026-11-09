import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Latido: una consulta mínima a la base para que Supabase no pause el proyecto
// por inactividad (en el plan gratuito se pausa tras 7 días sin uso).
// Lo llama una tarea diaria de Vercel (vercel.json → crons). No lee ni escribe
// datos: solo pide la hora del servidor con la función pública `latido()`.

export async function GET(req: Request) {
  await connection();

  // Vercel envía "Authorization: Bearer <CRON_SECRET>" en sus tareas programadas.
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("latido");
  if (error) {
    console.error("[latido] la base no respondió:", error.message);
    return Response.json({ ok: false, error: "La base no respondió." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  console.log("[latido] base activa:", data);
  return Response.json({ ok: true, hora: data }, { headers: { "Cache-Control": "no-store" } });
}
