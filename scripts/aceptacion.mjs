// Pruebas de aceptación del sistema, de punta a punta, en un navegador real.
//
// Uso (desde la raíz del proyecto):
//   npm run build && npx next start -p 3107      (en otra terminal)
//   npm run test:aceptacion                       (o: node scripts/aceptacion.mjs http://localhost:3107)
//
// - Entra con TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD de .env.test.
// - Usa la base configurada en .env.local (la real): crea registros de prueba
//   ("Prueba Aceptacion …", cédulas 91003xxxxx) y los borra al final. Queda el
//   rastro normal en el historial.
// - Las pruebas F llaman al asistente (gastan unos pocos tokens). Para gastar menos:
//   OMITIR=F6,F7,F8,F9 (las de importar Excel).
// - Navegador: Edge instalado (cambiar con NAVEGADOR=chrome). Capturas de fallas en data/capturas/.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const raiz = process.cwd();
const salida = join(raiz, "data", "capturas");
mkdirSync(salida, { recursive: true });
const BASE = (process.argv[2] ?? "http://localhost:3107").replace(/\/$/, "");
const leerEnv = (f) =>
  Object.fromEntries(
    readFileSync(join(raiz, f), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
const env = { ...leerEnv(".env.local"), ...leerEnv(".env.test") };
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const LIDER = "Prueba Aceptacion Lider";
const PERSONA = "Prueba Aceptacion Persona";
const SUELTA = "Prueba Aceptacion Suelta";
const CED_LIDER = "9100300001";
const CED_PERSONA = "9100300002";
const CED_SUELTA = "9100300003";

const resultados = [];
const erroresConsola = [];
let actual = "";
// OMITIR=F6,F7,F8,F9 salta esas pruebas (p. ej. para gastar menos tokens del asistente).
const OMITIR = new Set((process.env.OMITIR ?? "").split(",").map((s) => s.trim()).filter(Boolean));
async function prueba(id, nombre, fn, page) {
  if (OMITIR.has(id)) {
    console.log(`  – ${id} ${nombre} — omitida`);
    return;
  }
  actual = id;
  const t = Date.now();
  try {
    const detalle = await fn();
    resultados.push({ id, nombre, ok: true, detalle: detalle ?? "", ms: Date.now() - t });
    console.log(`  ✓ ${id} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  } catch (e) {
    const msg = String(e?.message ?? e).split("\n")[0].slice(0, 300);
    resultados.push({ id, nombre, ok: false, detalle: msg, ms: Date.now() - t });
    console.log(`  ✗ ${id} ${nombre} — ${msg}`);
    if (page) await page.screenshot({ path: join(salida, `falla-${id}.png`) }).catch(() => {});
  }
}
const afirmar = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// --- base de datos con la sesión de la administradora (RLS aplica) ---
const sb = createClient(URL_SB, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL_SB, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
{
  const { error } = await sb.auth.signInWithPassword({ email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD });
  if (error) throw new Error("No se pudo iniciar sesión de pruebas: " + error.message);
}
const contar = async (t) => (await sb.from(t).select("id", { count: "exact", head: true })).count;
async function limpiar() {
  await sb.from("personas").delete().or("nombre.like.Prueba Aceptacion%,cedula.like.91003%,nombre.like.Persona Prueba %,cedula.like.9100100%");
  await sb.from("referentes").delete().or("nombre.like.Prueba Aceptacion%,cedula.like.91003%,nombre.eq.Lider Prueba Asistente,cedula.like.9100100%");
  await sb.from("barrios").delete().eq("nombre", "Barrio Prueba Aceptacion");
}
await limpiar();
const antes = { personas: await contar("personas"), referentes: await contar("referentes"), vinculos: await contar("vinculos") };
console.log("Base antes:", JSON.stringify(antes));

const navegador = await chromium.launch({ channel: process.env.NAVEGADOR ?? "msedge" });
const nuevoContexto = async (opciones = {}) => {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-CO", ...opciones });
  ctx.setDefaultTimeout(20000);
  return ctx;
};
const escuchar = (page) => {
  page.on("console", (m) => m.type() === "error" && erroresConsola.push(`[${actual}] ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => erroresConsola.push(`[${actual}] pageerror: ${String(e).slice(0, 200)}`));
};
async function entrar(page) {
  await page.goto(`${BASE}/login`);
  await page.fill("#correo", env.TEST_ADMIN_EMAIL);
  await page.fill("#contrasena", env.TEST_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const quieta = async (page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
};

// =====================================================================
console.log("\nA. Acceso y seguridad");
{
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  escuchar(page);

  await prueba("A1", "Sin sesión, las páginas privadas llevan al login", async () => {
    for (const ruta of ["/", "/panel", "/lideres", "/revision"]) {
      await page.goto(BASE + ruta);
      afirmar(new URL(page.url()).pathname === "/login", `${ruta} no redirigió al login (${page.url()})`);
    }
  }, page);

  await prueba("A2", "Sin sesión, el asistente no responde", async () => {
    const r = await ctx.request.post(`${BASE}/api/asistente`, { data: { mensajes: [{ rol: "user", texto: "hola" }] }, maxRedirects: 0 });
    afirmar(r.status() === 401, `respondió ${r.status()}`);
    afirmar(/sesión venció/.test((await r.json()).error), "no explica que la sesión venció");
    return `HTTP ${r.status()}`;
  });

  await prueba("A6", "Latido: mantiene activa la base sin exponer datos", async () => {
    const r = await ctx.request.get(`${BASE}/api/latido`, { maxRedirects: 0 });
    if (r.status() === 401) return "protegido con CRON_SECRET (sin la clave responde 401)";
    afirmar(r.status() === 200, `respondió ${r.status()}`);
    const j = await r.json();
    afirmar(j.ok === true && !Number.isNaN(Date.parse(j.hora)), `respuesta: ${JSON.stringify(j)}`);
    afirmar(Object.keys(j).sort().join() === "consultas,hora,ok", "devuelve más de lo necesario");
    afirmar(j.consultas === 3, `hizo ${j.consultas} consultas`);
    return `${j.consultas} consultas; la base respondió ${j.hora}`;
  });

  await prueba("A3", "Sin sesión, la base no entrega ni acepta datos", async () => {
    for (const t of ["personas", "referentes", "vinculos", "historial", "importaciones", "admins", "referentes_resumen", "panel_calidad"]) {
      const { data, error } = await anon.from(t).select("*").limit(1);
      afirmar(error || !data?.length, `${t} devolvió filas sin sesión`);
    }
    const ins = await anon.from("personas").insert({ nombre: "Intruso" });
    afirmar(ins.error, "se pudo insertar sin sesión");
    for (const f of ["buscar_personas", "soy_admin"]) {
      const r = await anon.rpc(f, f === "buscar_personas" ? { p_texto: "ana" } : {});
      afirmar(r.error || r.data === false || (Array.isArray(r.data) && r.data.length === 0), `${f} respondió sin sesión`);
    }
  });

  await prueba("A4", "Login incorrecto: mensaje genérico, no entra", async () => {
    await page.goto(`${BASE}/login`);
    await page.fill("#correo", env.TEST_ADMIN_EMAIL);
    await page.fill("#contrasena", "clave-equivocada-123");
    await page.click('button[type="submit"]');
    await page.getByText("Correo o contraseña incorrectos.").waitFor();
    afirmar(new URL(page.url()).pathname === "/login", "salió del login");
  }, page);

  await prueba("A5", "Login correcto: entra al sistema", async () => {
    await entrar(page);
    await quieta(page);
    afirmar(await page.locator('nav[aria-label="Secciones de la campaña"]').isVisible(), "no se ve el menú");
    return new URL(page.url()).pathname;
  }, page);

  // =====================================================================
  console.log("\nB. Líderes y personas (consulta)");
  const { data: liderConDatos } = await sb
    .from("referentes")
    .select("id,nombre,cedula,celular,direccion")
    .eq("tipo", "lider")
    .not("celular", "is", null)
    .not("direccion", "is", null)
    .not("cedula", "is", null)
    .order("nombre")
    .limit(1)
    .single();

  await prueba("B1", "Lista de líderes con el número de personas de cada uno", async () => {
    await page.goto(`${BASE}/lideres`);
    await quieta(page);
    const filas = await page.locator(".panel-lista a[href*='referente=']").count();
    const { count } = await sb.from("referentes").select("id", { count: "exact", head: true }).eq("tipo", "lider");
    afirmar(filas === count, `la lista muestra ${filas} y la base tiene ${count}`);
    const primera = await page.locator(".panel-lista a[href*='referente=']").first().innerText();
    afirmar(/\d+\s*personas?/.test(primera), `la fila no trae el número: ${primera}`);
    return `${filas} líderes`;
  }, page);

  await prueba("B2", "Filtrar líderes por nombre (sin tildes) y por cédula", async () => {
    const filtro = page.locator(".panel-lista input");
    await filtro.fill("SAMUEL");
    const nombres = await page.locator(".panel-lista a[href*='referente='] span.font-semibold").allInnerTexts();
    afirmar(nombres.length > 0 && nombres.every((n) => /samuel/i.test(n)), `resultado: ${nombres.join(", ")}`);
    await filtro.fill(liderConDatos.cedula);
    const porCedula = await page.locator(".panel-lista a[href*='referente='] span.font-semibold").allInnerTexts();
    afirmar(porCedula.length === 1 && porCedula[0] === liderConDatos.nombre, `por cédula: ${porCedula.join(", ")}`);
    await filtro.fill("zzzzqqq");
    afirmar(await page.getByText("No hay líderes con ese nombre o cédula.").isVisible(), "no avisa lista vacía");
    await filtro.fill("");
  }, page);

  let personaVista = null;
  await prueba("B3", "Ficha del líder: sus personas, sin teléfono ni dirección", async () => {
    await page.goto(`${BASE}/lideres?referente=${liderConDatos.id}`);
    await quieta(page);
    const texto = await page.locator(".panel-ref").innerText();
    afirmar(texto.includes(liderConDatos.nombre), "no muestra el nombre");
    afirmar(/Personas vinculadas/.test(texto), "no muestra cuántas personas tiene");
    afirmar(!texto.includes(liderConDatos.celular), "muestra el celular del líder");
    afirmar(!texto.includes(liderConDatos.direccion), "muestra la dirección del líder");
    const { data: suyas } = await sb.rpc("personas_de_referente", { p_referente: liderConDatos.id });
    const enPantalla = await page.locator(".panel-ref ul.arbol > li").count();
    afirmar(enPantalla === suyas.length, `muestra ${enPantalla} personas y son ${suyas.length}`);
    personaVista = suyas[0] ?? null;
    return `${enPantalla} personas`;
  }, page);

  await prueba("B4", "Ficha de la persona: toda su información", async () => {
    afirmar(personaVista, "el líder de prueba no tiene personas");
    const { data: p } = await sb.from("personas").select("*").eq("id", personaVista.id).single();
    await page.locator(".panel-ref ul.arbol a").first().click();
    await page.waitForURL(/persona=/);
    await quieta(page);
    const texto = await page.locator(".panel-ficha").innerText();
    for (const titulo of ["DATOS PERSONALES", "VOTACIÓN", "REFERENTES", "AUTORIZACIÓN Y NOTAS", "HISTORIAL"]) {
      afirmar(texto.toUpperCase().includes(titulo), `falta el bloque ${titulo}`);
    }
    for (const campo of ["nombre", "cedula", "celular", "direccion", "barrio", "puesto_votacion"]) {
      if (p[campo]) afirmar(texto.includes(String(p[campo])), `no muestra ${campo}`);
    }
    afirmar(texto.includes(liderConDatos.nombre), "no muestra su líder");
  }, page);

  // =====================================================================
  console.log("\nC. Crear, editar y vincular");
  const dialogo = page.locator("dialog[open]");
  // Espera a que el formulario muestre un mensaje (el servidor tarda un momento).
  const esperarMensaje = async (patron) => {
    try {
      await dialogo.getByText(patron).first().waitFor({ timeout: 12000 });
    } catch {
      throw new Error(`no apareció ${patron}; se ve: ${(await dialogo.getByRole("alert").allInnerTexts()).join(" | ") || "(nada)"}`);
    }
  };

  await prueba("C1", "Crear líder: rechaza nombre vacío y cédulas no válidas", async () => {
    await page.goto(`${BASE}/lideres`);
    await quieta(page);
    await page.getByRole("button", { name: "Nuevo líder" }).click();
    await dialogo.getByRole("button", { name: "Crear líder" }).click();
    await esperarMensaje(/Escribe el nombre/);
    await dialogo.locator('input[name="nombre"]').fill(LIDER);
    for (const [ced, patron] of [["12AB56", /solo puede tener números/], ["12345", /entre 6 y 10/], ["12345678901", /entre 6 y 10/]]) {
      await dialogo.locator('input[name="cedula"]').fill(ced);
      await dialogo.getByRole("button", { name: "Crear líder" }).click();
      await esperarMensaje(patron);
    }
    afirmar((await sb.from("referentes").select("id").eq("nombre", LIDER)).data.length === 0, "se guardó un líder inválido");
  }, page);

  let liderId = null;
  await prueba("C2", "Crear líder: se guarda (cédula con puntos queda limpia)", async () => {
    await dialogo.locator('input[name="cedula"]').fill("9.100.300.001");
    await dialogo.locator('input[name="celular"]').fill("3009990001");
    await dialogo.locator('input[name="direccion"]').fill("Calle de Prueba 1");
    await dialogo.locator('input[name="mesa"]').fill("7");
    await dialogo.getByRole("button", { name: "Crear líder" }).click();
    await page.waitForURL(/referente=/);
    await quieta(page);
    const { data } = await sb.from("referentes").select("id,cedula,mesa,tipo,municipio").eq("nombre", LIDER).single();
    afirmar(data.cedula === CED_LIDER && data.mesa === 7 && data.tipo === "lider", `guardado: ${JSON.stringify(data)}`);
    liderId = data.id;
    const ficha = await page.locator(".panel-ref").innerText();
    afirmar(ficha.includes(LIDER) && !ficha.includes("3009990001") && !ficha.includes("Calle de Prueba 1"), "la ficha del líder nuevo no es correcta");
    return `municipio ${data.municipio}`;
  }, page);

  await prueba("C3", "Crear líder: no deja repetir la cédula", async () => {
    await page.getByRole("button", { name: "Nuevo líder" }).click();
    await dialogo.locator('input[name="nombre"]').fill("Prueba Aceptacion Repetido");
    await dialogo.locator('input[name="cedula"]').fill(CED_LIDER);
    await dialogo.getByRole("button", { name: "Crear líder" }).click();
    await esperarMensaje(/Ya hay un referente con esta cédula/);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
  }, page);

  await prueba("C4", "Editar líder: guarda el cambio y queda en el historial", async () => {
    await page.locator(".panel-ref").getByRole("button", { name: "Editar" }).click();
    await dialogo.locator('input[name="coordinador"]').waitFor();
    await dialogo.locator('input[name="coordinador"]').fill("Coordinador De Prueba");
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByText("Cambios guardados").waitFor();
    const { data } = await sb.from("referentes").select("coordinador,celular").eq("id", liderId).single();
    afirmar(data.coordinador === "Coordinador De Prueba" && data.celular === "3009990001", `guardado: ${JSON.stringify(data)}`);
    const { data: h } = await sb.from("historial").select("accion").eq("tabla", "referentes").eq("registro_id", liderId);
    afirmar(h.some((x) => x.accion === "crear") && h.some((x) => x.accion === "editar"), `historial: ${h.map((x) => x.accion)}`);
  }, page);

  let personaId = null;
  await prueba("C5", "Crear persona vinculada al líder (cédula con puntos)", async () => {
    await page.getByRole("button", { name: "Nueva persona" }).first().click();
    await dialogo.locator('input[name="nombre"]').fill(PERSONA);
    await dialogo.locator('input[name="cedula"]').fill("9.100.300.002");
    await dialogo.locator('input[name="celular"]').fill("3009990002");
    await dialogo.locator('input[name="direccion"]').fill("Carrera de Prueba 2");
    await dialogo.locator('input[name="mesa"]').fill("12");
    await dialogo.locator('select[name="municipio_verificacion"]').selectOption("Valledupar");
    await dialogo.locator('input[name="autorizacion_datos"]').check();
    await dialogo.locator('input[name="coordinador"]').fill("Coord Vinculo");
    afirmar((await dialogo.locator('select[name="referente_id"]').inputValue()) === liderId, "no propone el líder abierto");
    await dialogo.getByRole("button", { name: "Crear persona" }).click();
    await page.waitForURL(/persona=/);
    await quieta(page);
    const { data: p } = await sb.from("personas").select("*").eq("nombre", PERSONA).single();
    personaId = p.id;
    afirmar(p.cedula === CED_PERSONA && p.mesa === 12 && p.municipio_verificacion === "Valledupar" && p.autorizacion_datos && p.fecha_autorizacion, `persona: ${JSON.stringify(p)}`);
    const { data: v } = await sb.from("vinculos").select("referente_id,coordinador,activo").eq("persona_id", p.id);
    afirmar(v.length === 1 && v[0].referente_id === liderId && v[0].coordinador === "Coord Vinculo", `vínculo: ${JSON.stringify(v)}`);
    const ficha = await page.locator(".panel-ficha").innerText();
    afirmar(ficha.includes(CED_PERSONA) && ficha.includes("3009990002") && ficha.includes("Carrera de Prueba 2") && ficha.includes("Vota en Valledupar"), "la ficha no muestra todo");
    afirmar((await page.locator(".panel-ref").innerText()).includes(PERSONA), "no aparece en la lista del líder");
  }, page);

  await prueba("C6", "Persona: no deja usar una cédula repetida ni la de un líder", async () => {
    await page.getByRole("button", { name: "Nueva persona" }).first().click();
    await dialogo.locator('input[name="nombre"]').fill("Prueba Aceptacion Duplicada");
    await dialogo.locator('input[name="cedula"]').fill(CED_PERSONA);
    await dialogo.getByRole("button", { name: "Crear persona" }).click();
    await esperarMensaje(/Ya hay una persona registrada con esta cédula/);
    afirmar(await dialogo.getByText(`Esta cédula ya es de`).isVisible(), "no ofrece abrir a la persona existente");
    await dialogo.locator('input[name="cedula"]').fill(CED_LIDER);
    await dialogo.getByRole("button", { name: "Crear persona" }).click();
    await esperarMensaje(/es de un referente/);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    afirmar((await sb.from("personas").select("id").eq("nombre", "Prueba Aceptacion Duplicada")).data.length === 0, "se creó la duplicada");
  }, page);

  await prueba("C7", "Editar persona: guarda y el historial lo muestra", async () => {
    await page.locator(".panel-ficha").getByRole("button", { name: "Editar" }).click();
    await dialogo.locator('input[name="celular"]').fill("3009990099");
    await dialogo.locator('textarea[name="observaciones"]').fill("Nota de prueba");
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await page.getByText("Cambios guardados").waitFor();
    const t0 = Date.now();
    const { data: p } = await sb.from("personas").select("celular,observaciones,cedula").eq("id", personaId).single();
    afirmar(p.celular === "3009990099" && p.observaciones === "Nota de prueba" && p.cedula === CED_PERSONA, `guardado: ${JSON.stringify(p)}`);
    await page.locator(".panel-ficha").getByText(/Se editó: .*celular/).waitFor();
    const ms = Date.now() - t0;
    const ficha = await page.locator(".panel-ficha").innerText();
    afirmar(ficha.includes("3009990099"), "la ficha no muestra el celular nuevo");
    afirmar(/Se vinculó a Prueba Aceptacion Lider/.test(ficha) && /Registro creado/.test(ficha), "el historial no muestra creación y vínculo");
    return `la ficha se refrescó ${ms} ms después del aviso`;
  }, page);

  let otroLider = null;
  await prueba("C8", "Vincular a otro líder: avisa que ya está con uno y queda con dos", async () => {
    const { data } = await sb.from("referentes").select("id,nombre").eq("tipo", "lider").neq("id", liderId).neq("nombre", "Sin líder asignado").order("nombre").limit(1).single();
    otroLider = data;
    await page.locator(".panel-ficha").getByRole("button", { name: "Vincular a otro referente" }).click();
    afirmar(/Ya está con Prueba Aceptacion Lider/.test(await dialogo.innerText()), "no avisa que ya tiene referente");
    await dialogo.locator('select[name="referente_id"]').selectOption(otroLider.id);
    await dialogo.getByRole("button", { name: "Vincular", exact: true }).click();
    await page.getByText("Persona vinculada").waitFor();
    const { data: v } = await sb.from("vinculos").select("referente_id").eq("persona_id", personaId).eq("activo", true);
    afirmar(v.length === 2, `vínculos activos: ${v.length}`);
    await page.locator(".panel-ficha").getByText(/Está con 2 referentes/).waitFor();
  }, page);

  await prueba("C9", "Vincular desde el líder: busca a la persona y no deja repetir el vínculo", async () => {
    await page.goto(`${BASE}/lideres?referente=${liderId}`);
    await quieta(page);
    await page.getByRole("button", { name: "Vincular persona" }).click();
    await dialogo.getByLabel("Buscar persona").fill(CED_PERSONA);
    await dialogo.getByRole("button", { name: new RegExp(PERSONA) }).click();
    await dialogo.getByText("Esta persona ya está vinculada a este referente.").waitFor();
    afirmar(await dialogo.getByRole("button", { name: "Vincular", exact: true }).isDisabled(), "deja vincular dos veces");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
  }, page);

  // =====================================================================
  console.log("\nD. Sin líder y panel de Revisión");
  let sueltaId = null;
  await prueba("D1", "Persona creada sin líder queda en «Sin líder asignado»", async () => {
    await page.goto(`${BASE}/lideres`);
    await quieta(page);
    await page.getByRole("button", { name: "Nueva persona" }).first().click();
    await dialogo.locator('input[name="nombre"]').fill(SUELTA);
    await dialogo.getByRole("button", { name: "Crear persona" }).click();
    await page.waitForURL(/persona=/);
    const { data: p } = await sb.from("personas").select("id").eq("nombre", SUELTA).single();
    sueltaId = p.id;
    const { data: v } = await sb.from("vinculos").select("activo,referente:referentes!inner(nombre)").eq("persona_id", p.id);
    afirmar(v.length === 1 && v[0].referente.nombre === "Sin líder asignado" && v[0].activo, `vínculos: ${JSON.stringify(v)}`);
  }, page);

  await prueba("D2", "Revisión: aparece, exige elegir líder y valida la cédula", async () => {
    await page.goto(`${BASE}/revision`);
    await quieta(page);
    await page.getByRole("button", { name: /^Sin líder/ }).click();
    const fila = page.locator("li", { hasText: SUELTA });
    await fila.waitFor();
    await fila.getByRole("button", { name: "Guardar" }).click();
    afirmar(/Elija el líder/.test((await fila.getByRole("alert").allInnerTexts()).join(" ")), "no exige el líder");
    await fila.locator('select[name="referente_id"]').selectOption(liderId);
    await fila.locator('input[name="cedula"]').fill("123");
    await fila.getByRole("button", { name: "Guardar" }).click();
    await fila.getByText(/entre 6 y 10/).waitFor();
    await fila.locator('input[name="cedula"]').fill(CED_PERSONA);
    await fila.getByRole("button", { name: "Guardar" }).click();
    await fila.getByText(/Esta cédula ya es de/).waitFor();
  }, page);

  await prueba("D3", "Revisión: al arreglarla se guarda, sale de la lista y baja el contador", async () => {
    const pestana = () => page.locator('nav[aria-label="Secciones de la campaña"] a[href="/revision"]').innerText();
    const n0 = Number((await pestana()).replace(/\D/g, ""));
    const fila = page.locator("li", { hasText: SUELTA });
    await fila.locator('input[name="cedula"]').fill("9.100.300.003");
    await fila.getByRole("button", { name: "Guardar" }).click();
    await page.waitForFunction((n) => !document.querySelector("main")?.innerText.includes(n), SUELTA);
    await quieta(page);
    const n1 = Number((await pestana()).replace(/\D/g, ""));
    afirmar(n1 === n0 - 1, `contador: ${n0} → ${n1}`);
    const { data: p } = await sb.from("personas").select("cedula").eq("id", sueltaId).single();
    const { data: v } = await sb.from("vinculos").select("activo,referente:referentes!inner(nombre)").eq("persona_id", sueltaId);
    afirmar(p.cedula === CED_SUELTA, `cédula: ${p.cedula}`);
    afirmar(v.find((x) => x.referente.nombre === LIDER)?.activo === true && v.find((x) => x.referente.nombre === "Sin líder asignado")?.activo === false, `vínculos: ${JSON.stringify(v)}`);
    return `contador ${n0} → ${n1}`;
  }, page);

  // =====================================================================
  console.log("\nE. Buscador y panel");
  const buscador = page.getByRole("combobox", { name: /Buscar personas o líderes/ });
  await prueba("E1", "Buscador: persona por cédula con puntos y por nombre", async () => {
    await page.goto(`${BASE}/panel`);
    await quieta(page);
    await buscador.fill("9.100.300.002");
    await page.locator("#resultados-busqueda", { hasText: PERSONA }).waitFor();
    afirmar((await page.locator("#resultados-busqueda").innerText()).includes(`C.C. ${CED_PERSONA}`), "no muestra la cédula completa");
    await buscador.fill("prueba aceptacion suel");
    await page.locator("#resultados-busqueda", { hasText: SUELTA }).waitFor();
    await buscador.press("Enter");
    await page.waitForURL(/persona=/);
    await quieta(page);
    afirmar((await page.locator(".panel-ficha").innerText()).includes(SUELTA), "Enter no abrió la ficha");
  }, page);

  await prueba("E2", "Buscador: líder por cédula y por nombre; atajo «/»", async () => {
    const h1 = await page.locator("h1:visible").allInnerTexts();
    afirmar(h1.length === 1, `la página tiene ${h1.length} títulos principales: ${h1.join(" | ")}`);
    await page.locator("main h1:visible").first().click();
    await page.keyboard.press("/");
    afirmar(await buscador.evaluate((el) => el === document.activeElement), "«/» no enfoca el buscador");
    await buscador.fill(CED_LIDER);
    const res = page.locator("#resultados-busqueda");
    await res.getByText(LIDER).waitFor();
    afirmar(/Líder/.test(await res.innerText()), "no lo marca como líder");
    await buscador.press("Enter");
    await page.waitForURL(new RegExp(`referente=${liderId}`));
    await buscador.fill("xqzxqz");
    await res.getByText("No se encontró a nadie.").waitFor();
    await buscador.fill("");
  }, page);

  await prueba("E3", "Panel de avance: cifras iguales a la base", async () => {
    await page.goto(`${BASE}/panel`);
    await quieta(page);
    const texto = await page.locator("main").innerText();
    const total = await contar("personas");
    afirmar(texto.includes(`${total.toLocaleString("es-CO")} personas`), `no muestra ${total} personas`);
    for (const caja of ["Mejores referentes", "Con menos personas", "Barrios", "Calidad de datos"]) afirmar(texto.includes(caja), `falta "${caja}"`);
    const { data: cal } = await sb.from("panel_calidad").select("*").single();
    afirmar(texto.includes(String(cal.sin_cedula)) && texto.includes(String(cal.sin_puesto)), "calidad de datos no coincide");
    return `${total} personas`;
  }, page);

  await prueba("E5", "Cada pantalla carga en menos de 3 segundos", async () => {
    const t = {};
    for (const [n, ruta] of [["panel", "/panel"], ["lideres", "/lideres"], ["lider", `/lideres?referente=${liderConDatos.id}`], ["persona", `/lideres?referente=${liderId}&persona=${personaId}`], ["revision", "/revision"]]) {
      const t0 = Date.now();
      await page.goto(BASE + ruta, { waitUntil: "networkidle" });
      t[n] = Date.now() - t0;
    }
    const lenta = Object.entries(t).find(([, ms]) => ms > 3000);
    afirmar(!lenta, `${lenta?.[0]} tardó ${lenta?.[1]} ms`);
    return Object.entries(t).map(([k, v]) => `${k} ${v} ms`).join(" · ");
  }, page);

  await prueba("E4", "Rutas que no existen muestran «no encontrado», no un error", async () => {
    await page.goto(`${BASE}/constructor`);
    await quieta(page);
    const cuerpo = await page.locator("body").innerText();
    afirmar(/Esta página no existe/.test(cuerpo), `no avisa en español: ${cuerpo.slice(0, 120)}`);
    afirmar(!/Application error|Algo salió mal/i.test(cuerpo), "muestra un error");
    await page.goto(`${BASE}/lideres?referente=no-es-un-id&persona=tampoco`);
    await quieta(page);
    afirmar(await page.getByText("Elija un referente para ver sus personas.").isVisible(), "un id inválido rompe la página");
  }, page);

  await prueba("E6", "Copia de seguridad: descarga las 3 tablas completas en CSV", async () => {
    const sinSesion = await fetch(`${BASE}/api/exportar?tabla=personas`);
    afirmar(sinSesion.status === 401, `sin sesión responde ${sinSesion.status}`);
    const filas = {};
    for (const tabla of ["personas", "referentes", "vinculos"]) {
      const r = await page.request.get(`${BASE}/api/exportar?tabla=${tabla}`);
      afirmar(r.ok(), `${tabla}: HTTP ${r.status()}`);
      afirmar(/attachment; filename="copia-/.test(r.headers()["content-disposition"] ?? ""), `${tabla}: no se descarga como archivo`);
      const texto = await r.text();
      afirmar(texto.startsWith("﻿"), `${tabla}: sin BOM`);
      // Filas = registros (las observaciones pueden tener saltos de línea entre comillas).
      const registros = texto.replace(/"(?:[^"]|"")*"/g, "").trimEnd().split("\r\n").length - 1;
      const enBase = await contar(tabla);
      afirmar(registros === enBase, `${tabla}: ${registros} filas, la base tiene ${enBase}`);
      if (tabla === "personas") afirmar(texto.includes(CED_PERSONA) && texto.includes(LIDER), "personas: falta la de prueba con su líder");
      filas[tabla] = registros;
    }
    // El menú de la cuenta ofrece la copia.
    await page.getByRole("button", { name: "Menú de la cuenta" }).click();
    afirmar(await page.getByRole("button", { name: "Descargar las 3" }).isVisible(), "el menú no muestra la copia");
    await page.keyboard.press("Escape");
    return Object.entries(filas).map(([k, v]) => `${k} ${v}`).join(" · ");
  }, page);

  // =====================================================================
  console.log("\nF. Asistente");
  const panel = page.locator("#panel-asistente");
  const libre = async () => {
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelector("#panel-asistente")?.getAttribute("aria-busy") === "false", null, { timeout: 120000 });
    await page.waitForTimeout(600);
  };
  const preguntar = async (texto) => {
    await panel.locator("textarea").fill(texto);
    await panel.locator('button[aria-label="Enviar"]:not([disabled])').waitFor();
    await panel.locator("textarea").press("Enter");
    await libre();
    const todo = await panel.locator('[aria-live="polite"]').innerText();
    return todo.slice(todo.lastIndexOf(texto) + texto.length).trim();
  };

  await prueba("F1", "Abre con Ctrl+K, enfoca el texto y cierra con Esc", async () => {
    await page.goto(`${BASE}/lideres`);
    await quieta(page);
    await page.keyboard.press("Control+K");
    await panel.waitFor({ state: "visible" });
    afirmar(await panel.locator("textarea").evaluate((el) => el === document.activeElement), "no enfoca el cuadro de texto");
    afirmar(/Hola/.test(await panel.innerText()), "no muestra el saludo");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "hidden" });
    await page.keyboard.press("Control+K");
    await panel.waitFor({ state: "visible" });
  }, page);

  await prueba("F2", "Consulta con datos reales de la base", async () => {
    const r = await preguntar(`¿Cuántas personas tiene el líder ${LIDER}?`);
    afirmar(/\b2\b|dos/i.test(r), `respuesta: ${r.slice(0, 200)}`);
    return r.replace(/\s+/g, " ").slice(0, 90);
  }, page);

  await prueba("F3", "Muestra cédula, celular y dirección de una persona", async () => {
    const r = await preguntar(`Muéstrame la cédula, el celular y la dirección de ${PERSONA}`);
    afirmar(r.includes(CED_PERSONA) && r.includes("3009990099") && /Carrera de Prueba 2/i.test(r), `respuesta: ${r.slice(0, 250)}`);
  }, page);

  await prueba("F4", "Proponer un cambio: no guarda hasta confirmar; al confirmar, guarda", async () => {
    await preguntar(`Crea una persona llamada Prueba Aceptacion Bot con cédula 9100300004 y vincúlala al líder ${LIDER}`);
    const tarjeta = panel.locator("div.rounded-card", { hasText: "Borrador" }).last();
    await tarjeta.waitFor();
    afirmar((await sb.from("personas").select("id").eq("cedula", "9100300004")).data.length === 0, "guardó sin confirmar");
    await tarjeta.getByRole("button", { name: "Confirmar" }).click();
    await panel.getByText(/Guardado:/).waitFor();
    const { data } = await sb.from("personas").select("id,nombre").eq("cedula", "9100300004");
    afirmar(data.length === 1, "no guardó al confirmar");
    const { data: v } = await sb.from("vinculos").select("referente_id").eq("persona_id", data[0].id).eq("activo", true);
    afirmar(v.length === 1 && v[0].referente_id === liderId, `vínculo: ${JSON.stringify(v)}`);
  }, page);

  await prueba("F5", "Descartar un borrador no guarda nada", async () => {
    await preguntar(`Crea una persona llamada Prueba Aceptacion Descartada con cédula 9100300005 con el líder ${LIDER}`);
    const tarjeta = panel.locator("div.rounded-card", { hasText: "Borrador" }).last();
    await tarjeta.getByRole("button", { name: "Descartar" }).click();
    await page.waitForTimeout(800);
    afirmar((await sb.from("personas").select("id").eq("cedula", "9100300005")).data.length === 0, "guardó un borrador descartado");
  }, page);

  let loteId = null;
  await prueba("F6", "Importar Excel de la campaña: vista previa correcta sin guardar", async () => {
    await panel.getByRole("button", { name: "Nueva conversación" }).click();
    await panel.locator('input[type="file"]').setInputFiles(join(raiz, "data", "prueba-campana.xlsx"));
    await page.waitForTimeout(500);
    await panel.locator("textarea").fill("Importa este archivo");
    await panel.locator("textarea").press("Enter");
    await panel.getByText("Vista previa de la importación").waitFor({ timeout: 120000 });
    await libre();
    await libre();
    await page.evaluate(() => document.querySelectorAll("#panel-asistente details").forEach((d) => (d.open = true)));
    const t = await panel.locator("div.rounded-card", { hasText: "Vista previa de la importación" }).last().innerText();
    afirmar(/Lider Prueba Asistente/.test(t) && /Persona Prueba Uno/.test(t), "faltan los nuevos");
    afirmar(/entre 6 y 10 dígitos/.test(t) && /Cédula repetida en el archivo/.test(t), "faltan los problemas");
    afirmar(/» se parece a «/.test(t), "falta la duda del líder parecido");
    afirmar(/no tiene líder/.test(t), "no avisa la persona sin líder");
    afirmar((await sb.from("personas").select("id").like("cedula", "9100100%")).data.length === 0, "guardó antes de confirmar");
  }, page);

  await prueba("F7", "Importar: un solo lote, sin duplicar líderes", async () => {
    await panel.getByRole("button", { name: "Es el mismo" }).click();
    await page.waitForFunction(() => !document.querySelector("#panel-asistente")?.innerText.includes("se parece a"));
    await page.waitForTimeout(800);
    await panel.getByRole("button", { name: /^Importar \d+$/ }).click();
    await panel.getByText(/Se importaron/).waitFor({ timeout: 60000 });
    const { data: lote } = await sb.from("importaciones").select("id,filas_creadas,tipo").eq("archivo_nombre", "prueba-campana.xlsx").is("deshecha_at", null).order("created_at", { ascending: false }).limit(1).single();
    loteId = lote.id;
    const { data: per } = await sb.from("personas").select("nombre,cedula").eq("lote_id", lote.id);
    const { data: ref } = await sb.from("referentes").select("nombre").eq("lote_id", lote.id);
    afirmar(per.length === 6 && ref.length === 1 && lote.filas_creadas === 7, `lote: ${per.length} personas, ${ref.length} líderes`);
    const { data: sl } = await sb.from("vinculos").select("persona:personas!inner(nombre),referente:referentes!inner(nombre)").eq("lote_id", lote.id);
    afirmar(sl.find((x) => x.persona.nombre === "Persona Prueba Sin Lider")?.referente.nombre === "Sin líder asignado", "la persona sin líder no quedó en «Sin líder asignado»");
    return "1 líder + 6 personas";
  }, page);

  await prueba("F8", "Deshacer lote: borra todo lo importado", async () => {
    await panel.getByRole("button", { name: "Deshacer" }).click();
    await panel.getByText(/Se deshizo el lote/).waitFor({ timeout: 60000 });
    afirmar((await sb.from("personas").select("id").eq("lote_id", loteId)).data.length === 0, "quedaron personas del lote");
    afirmar((await sb.from("referentes").select("id").eq("lote_id", loteId)).data.length === 0, "quedaron líderes del lote");
    afirmar((await sb.from("importaciones").select("deshecha_at").eq("id", loteId).single()).data.deshecha_at, "el lote no quedó marcado como deshecho");
  }, page);

  await prueba("F9", "Reimportar el Excel real no crea nada (no duplica)", async () => {
    const real = readdirSync(join(raiz, "data")).find((f) => f.startsWith("BD") && f.endsWith(".xlsx") && !f.includes("prueba"));
    if (!real || !existsSync(join(raiz, "data", real))) return "omitida: no está el Excel real en data/";
    await panel.getByRole("button", { name: "Nueva conversación" }).click();
    await panel.locator('input[type="file"]').setInputFiles(join(raiz, "data", real));
    await page.waitForTimeout(800);
    await panel.locator("textarea").fill("Importa la hoja BD");
    await panel.locator("textarea").press("Enter");
    await panel.getByText("Vista previa de la importación").waitFor({ timeout: 120000 });
    await libre();
    await libre();
    const t = await panel.locator("div.rounded-card", { hasText: "Vista previa de la importación" }).last().innerText();
    const nuevos = Number(t.match(/(\d+)\s*\n?\s*se importan/)?.[1] ?? -1);
    await panel.getByRole("button", { name: "Cancelar" }).click();
    return `${nuevos} por importar (las personas borradas a propósito en Revisión volverían a salir como nuevas)`;
  }, page);

  await page.keyboard.press("Escape");

  // =====================================================================
  console.log("\nG. Celular");
  {
    const cel = await nuevoContexto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pm = await cel.newPage();
    escuchar(pm);
    await entrar(pm);
    await prueba("G1", "Sin desplazamiento horizontal en ninguna pantalla", async () => {
      for (const ruta of ["/panel", "/lideres", `/lideres?referente=${liderId}`, `/lideres?referente=${liderId}&persona=${personaId}`, "/revision", "/empresarios"]) {
        await pm.goto(BASE + ruta);
        await quieta(pm);
        const [ancho, vista] = await pm.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        afirmar(ancho <= vista + 1, `${ruta.split("?")[0]} se sale: ${ancho}px en ${vista}px`);
      }
    }, pm);
    await prueba("G2", "Recorrido en celular: líder → persona → Volver", async () => {
      await pm.goto(`${BASE}/lideres`);
      await quieta(pm);
      await pm.locator(".panel-lista input").fill("prueba aceptacion");
      await pm.locator(".panel-lista a[href*='referente=']").first().click();
      await pm.waitForURL(/referente=/);
      await pm.locator(".panel-ref ul.arbol a", { hasText: PERSONA }).click();
      await pm.waitForURL(/persona=/);
      await quieta(pm);
      afirmar(await pm.locator(".panel-ficha").getByText(CED_PERSONA).first().isVisible(), "no se ve la ficha");
      await pm.locator(".panel-ficha").getByRole("link", { name: "Volver" }).click();
      await pm.waitForURL((u) => !u.search.includes("persona="));
    }, pm);
    await prueba("G3", "Asistente a pantalla completa en celular", async () => {
      await pm.locator('button[aria-controls="panel-asistente"]').click();
      const caja = await pm.locator("#panel-asistente").boundingBox();
      afirmar(caja.width >= 389 && caja.height >= 800, `tamaño ${caja.width}x${caja.height}`);
      afirmar(!(await pm.getByRole("button", { name: "Ampliar panel" }).isVisible()), "muestra Ampliar en celular");
      await pm.getByRole("button", { name: "Cerrar", exact: true }).click();
    }, pm);
    await cel.close();
  }

  // =====================================================================
  console.log("\nH. Cierre de sesión");
  await prueba("H1", "Cerrar sesión y no poder volver sin entrar de nuevo", async () => {
    await page.goto(`${BASE}/panel`);
    await quieta(page);
    await page.getByRole("button", { name: "Menú de la cuenta" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/login/);
    await page.goto(`${BASE}/lideres`);
    afirmar(new URL(page.url()).pathname === "/login", "sigue entrando tras cerrar sesión");
    const r = await ctx.request.post(`${BASE}/api/asistente`, { data: { mensajes: [{ rol: "user", texto: "hola" }] }, maxRedirects: 0 });
    afirmar(r.status() === 401, `el asistente respondió ${r.status()} tras cerrar sesión`);
  }, page);
  await ctx.close();
}

// =====================================================================
console.log("\nI. Limpieza e integridad");
await prueba("I1", "Sin errores en la consola del navegador durante todo el recorrido", async () => {
  // El 404 de E4 y los 4xx esperados de formularios no cuentan.
  const reales = erroresConsola.filter((e) => !/\[E4\]/.test(e) && !/status of 40[0-9]/.test(e));
  afirmar(reales.length === 0, `${reales.length}: ${reales.slice(0, 3).join(" || ")}`);
  return `${erroresConsola.length - reales.length} avisos esperados ignorados`;
});
await limpiar();
await prueba("I2", "La base queda igual que antes de las pruebas", async () => {
  const despues = { personas: await contar("personas"), referentes: await contar("referentes"), vinculos: await contar("vinculos") };
  afirmar(JSON.stringify(despues) === JSON.stringify(antes), `antes ${JSON.stringify(antes)} / después ${JSON.stringify(despues)}`);
  const { count } = await sb.from("personas").select("id", { count: "exact", head: true }).is("nombre", null);
  afirmar(!count, "hay personas sin nombre");
  return JSON.stringify(despues);
});

await sb.auth.signOut();
await navegador.close();
const fallas = resultados.filter((r) => !r.ok);
console.log(`\nRESULTADO: ${resultados.length - fallas.length} de ${resultados.length} pruebas pasan.`);
if (fallas.length) console.log("FALLAS:\n" + fallas.map((f) => `  ${f.id} ${f.nombre}: ${f.detalle}`).join("\n"));
if (erroresConsola.length) console.log("CONSOLA:\n" + erroresConsola.slice(0, 15).join("\n"));
