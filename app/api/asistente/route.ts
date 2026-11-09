import Anthropic from "@anthropic-ai/sdk";
import { MAX_MENSAJES, MAX_TEXTO, MAX_TOKENS, MAX_TOKENS_RESUMEN, MAX_VUELTAS, MODELO, SISTEMA } from "@/lib/asistente/config";
import { ejecutar, estadoDe, HERRAMIENTAS, type Contexto } from "@/lib/asistente/herramientas";
import type { Evento, MensajeChat } from "@/lib/asistente/tipos";
import { catalogos } from "@/lib/datos";
import { crearClienteServidor } from "@/lib/supabase/server";

// Chat del asistente. Exige sesión de administradora. Todas las consultas usan
// la sesión de la usuaria (RLS aplica); nunca la service_role key.
// Responde en streaming: una línea JSON por evento (ver lib/asistente/tipos.ts).

// Caché del prompt: un punto de corte al final de las herramientas y otro en el
// sistema (las herramientas van primero en el prefijo). Ambos son estables.
const HERRAMIENTAS_CON_CACHE: Anthropic.Tool[] = HERRAMIENTAS.map((h, i) =>
  i === HERRAMIENTAS.length - 1 ? { ...h, cache_control: { type: "ephemeral" } } : h,
);

const json = (status: number, mensaje: string) =>
  Response.json({ error: mensaje }, { status, headers: { "Cache-Control": "no-store" } });

// Solo el texto de los últimos MAX_MENSAJES mensajes, empezando por uno de la usuaria.
// (Entre turnos no se reenvían bloques de razonamiento: así recortar el
// historial no rompe la validación del modelo.)
function leerMensajes(v: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (m) =>
      m && typeof m === "object" &&
      (m.rol === "user" || m.rol === "assistant") &&
      typeof m.texto === "string" && m.texto.length <= MAX_TEXTO,
  );
  if (!ok) return null;
  const lista = (v as MensajeChat[]).filter((m) => m.texto.trim()).slice(-MAX_MENSAJES);
  while (lista.length && lista[0]!.rol !== "user") lista.shift();
  if (!lista.length || lista.at(-1)!.rol !== "user") return null;
  return lista.map((m) => ({ role: m.rol, content: m.texto }));
}

function leerHojas(v: unknown): Record<string, string[]> {
  const hojas: Record<string, string[]> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return hojas;
  for (const [nombre, enc] of Object.entries(v).slice(0, 30)) {
    if (Array.isArray(enc)) hojas[nombre.slice(0, 120)] = enc.filter((e) => typeof e === "string").slice(0, 200);
  }
  return hojas;
}

function mensajeError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "La clave del asistente no es válida. Avísale al desarrollador.";
  if (e instanceof Anthropic.RateLimitError) return "El asistente está muy ocupado. Espera un momento e intenta de nuevo.";
  if (e instanceof Anthropic.APIConnectionError) return "No se pudo conectar con el asistente. Revisa tu conexión.";
  if (e instanceof Anthropic.APIError) return "El asistente tuvo un problema. Intenta de nuevo.";
  return "Algo salió mal. Intenta de nuevo.";
}

export async function POST(req: Request) {
  // 1. Sesión y administradora.
  const supabase = await crearClienteServidor();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return json(401, "Inicia sesión.");
  const { data: esAdmin, error: errAdmin } = await supabase.rpc("soy_admin");
  if (errAdmin || esAdmin !== true) return json(403, "No tienes permiso para usar el asistente.");

  if (!process.env.ANTHROPIC_API_KEY) return json(500, "El asistente no está configurado (falta la clave).");

  // 2. Entrada.
  let cuerpo: { mensajes?: unknown; hojas?: unknown; resumen?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, "Mensaje no válido.");
  }
  const mensajes = leerMensajes(cuerpo.mensajes);
  if (!mensajes) return json(400, "Mensaje no válido.");

  const ctx: Contexto = { supabase, catalogos, hojas: leerHojas(cuerpo.hojas) };
  // Explicar la vista previa de una importación: respuesta corta.
  const maxTokens = cuerpo.resumen === true ? MAX_TOKENS_RESUMEN : MAX_TOKENS;
  const cliente = new Anthropic();
  const codificador = new TextEncoder();

  const flujo = new ReadableStream<Uint8Array>({
    async start(control) {
      // Si el navegador se desconectó, enqueue falla: se ignora.
      const enviar = (e: Evento) => {
        try {
          control.enqueue(codificador.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
      const uso = { entrada: 0, salida: 0, cache_leida: 0, cache_escrita: 0, vueltas: 0 };

      try {
        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
          uso.vueltas++;
          const stream = cliente.messages.stream(
            {
              model: MODELO,
              max_tokens: maxTokens,
              // Chat y herramientas cortas: poco razonamiento (también cabe en 1024 tokens).
              output_config: { effort: "low" },
              system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
              tools: HERRAMIENTAS_CON_CACHE,
              messages: mensajes,
            },
            { signal: req.signal },
          );
          stream.on("text", (t) => enviar({ tipo: "texto", texto: t }));
          const msj = await stream.finalMessage();

          uso.entrada += msj.usage.input_tokens;
          uso.salida += msj.usage.output_tokens;
          uso.cache_leida += msj.usage.cache_read_input_tokens ?? 0;
          uso.cache_escrita += msj.usage.cache_creation_input_tokens ?? 0;

          if (msj.stop_reason === "refusal") {
            enviar({ tipo: "error", texto: "El asistente no puede ayudar con esa solicitud." });
            break;
          }
          const usos = msj.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          if (msj.stop_reason === "max_tokens") {
            enviar({ tipo: "error", texto: usos.length ? "La respuesta quedó muy larga. Pide algo más corto." : "…(respuesta cortada)" });
            break;
          }
          if (msj.stop_reason !== "tool_use" || usos.length === 0) break;

          // Se devuelve el turno completo (con su razonamiento) y todos los resultados juntos.
          mensajes.push({ role: "assistant", content: msj.content });
          const resultados: Anthropic.ToolResultBlockParam[] = [];
          for (const u of usos) {
            enviar({ tipo: "estado", texto: estadoDe(u.name) });
            const s = await ejecutar(ctx, u.name, u.input);
            if (s.evento) enviar(s.evento);
            resultados.push({
              type: "tool_result",
              tool_use_id: u.id,
              content: JSON.stringify(s.resultado),
              ...(s.error ? { is_error: true } : {}),
            });
          }
          mensajes.push({ role: "user", content: resultados });
          if (vuelta === MAX_VUELTAS - 1) enviar({ tipo: "error", texto: "La consulta necesitó demasiados pasos. Intenta pedirla más sencilla." });
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("[asistente]", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
          enviar({ tipo: "error", texto: mensajeError(e) });
        }
      } finally {
        console.log(
          `[asistente] modelo=${MODELO} max_tokens=${maxTokens} vueltas=${uso.vueltas} tokens entrada=${uso.entrada} salida=${uso.salida} caché_leída=${uso.cache_leida} caché_escrita=${uso.cache_escrita}`,
        );
        enviar({ tipo: "fin" });
        try {
          control.close();
        } catch {}
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
