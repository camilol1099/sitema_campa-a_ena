import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Latido: una consulta mínima a la base para que Supabase no pause el proyecto
// por inactividad (en el plan gratuito se pausa tras 7 días sin uso).
// Lo llama Vercel Schedules cada 6 horas (vercel.json → schedules.latido). No lee ni escribe
// datos: solo pide la hora del servidor con la función pública `latido()`,
// 3 veces por llamada (Supabase pide "unas pocas consultas a la base cada día").

const CONSULTAS = 3;

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
  // Supabase pide "unas pocas consultas al día": se hacen CONSULTAS, una tras otra.
  let hora: unknown = null;
  for (let i = 0; i < CONSULTAS; i++) {
    const { data, error } = await supabase.rpc("latido");
    if (error) {
      console.error(`[latido] la base no respondió (consulta ${i + 1} de ${CONSULTAS}):`, error.message);
      return Response.json({ ok: false, error: "La base no respondió." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    hora = data;
  }
  console.log(`[latido] base activa (${CONSULTAS} consultas):`, hora);
  return Response.json({ ok: true, consultas: CONSULTAS, hora }, { headers: { "Cache-Control": "no-store" } });
}
