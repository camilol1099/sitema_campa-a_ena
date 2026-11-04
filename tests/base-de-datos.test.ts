/**
 * Pruebas de la base de datos (permisos, validaciones e historial).
 * Corren contra el proyecto de Supabase configurado en .env.test.
 * Crean registros de prueba con cédulas que empiezan por 9 y los borran al final.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const EMAIL = process.env.TEST_ADMIN_EMAIL!
const PASSWORD = process.env.TEST_ADMIN_PASSWORD!

const nuevoCliente = () =>
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// Cédula de prueba única: solo dígitos, empieza por 9
const cedulaPrueba = () => '9' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10)

let anon: SupabaseClient
let admin: SupabaseClient
let referenteId: string
const personasCreadas: string[] = []

beforeAll(async () => {
  if (!URL || !KEY || !EMAIL || !PASSWORD) {
    throw new Error('Faltan variables en .env.test (URL, clave pública, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)')
  }
  anon = nuevoCliente()
  admin = nuevoCliente()
  const { error } = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw new Error('No se pudo iniciar sesión como admin: ' + error.message)

  const { data, error: e2 } = await admin
    .from('referentes').select('id').eq('tipo', 'lider').limit(1).single()
  if (e2 || !data) throw new Error('No hay ningún líder en la base (¿corriste el seed?)')
  referenteId = data.id
})

afterAll(async () => {
  if (personasCreadas.length) {
    await admin.from('personas').delete().in('id', personasCreadas)
  }
  await admin?.auth.signOut()
})

async function crearPersona(extra: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from('personas')
    .insert({ nombre: 'Persona de Prueba', cedula: cedulaPrueba(), ...extra })
    .select('id, cedula')
    .single()
  if (data) personasCreadas.push(data.id)
  return { data, error }
}

// ─────────────────────────────────────────────
describe('Sin sesión (clave pública)', () => {
  for (const tabla of ['referentes', 'personas', 'vinculos', 'historial', 'referentes_resumen']) {
    it(`no puede leer ${tabla}`, async () => {
      const { data, error } = await anon.from(tabla).select('*').limit(1)
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })
  }

  it('no puede crear personas', async () => {
    const { error } = await anon.from('personas').insert({ nombre: 'Intruso', cedula: cedulaPrueba() })
    expect(error).not.toBeNull()
  })

  it('no inicia sesión con contraseña incorrecta', async () => {
    const c = nuevoCliente()
    const { error } = await c.auth.signInWithPassword({ email: EMAIL, password: 'incorrecta-123' })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────
describe('Admin', () => {
  it('puede leer referentes y personas', async () => {
    const r = await admin.from('referentes').select('id').limit(1)
    const p = await admin.from('personas').select('id').limit(1)
    expect(r.error).toBeNull()
    expect(p.error).toBeNull()
    expect(r.data!.length).toBeGreaterThan(0)
  })

  it('el resumen de referentes no trae teléfono ni dirección', async () => {
    const { data, error } = await admin.from('referentes_resumen').select('*').limit(1).single()
    expect(error).toBeNull()
    expect(data).not.toHaveProperty('celular')
    expect(data).not.toHaveProperty('direccion')
    expect(data).toHaveProperty('total_personas')
  })

  it('no puede escribir directamente en el historial', async () => {
    const { error } = await admin.from('historial').insert({
      tabla: 'personas', registro_id: referenteId, accion: 'crear', cambios: {},
    })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────
describe('Validaciones de personas', () => {
  it('crea una persona válida', async () => {
    const { data, error } = await crearPersona()
    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
  })

  it('permite persona sin cédula', async () => {
    const { error } = await crearPersona({ cedula: null })
    expect(error).toBeNull()
  })

  it('rechaza cédula con letras', async () => {
    const { error } = await crearPersona({ cedula: '12A45' })
    expect(error?.code).toBe('23514') // violación de check
  })

  it('rechaza cédula repetida', async () => {
    const { data } = await crearPersona()
    const { error } = await crearPersona({ cedula: data!.cedula })
    expect(error?.code).toBe('23505') // violación de único
  })

  it('rechaza mesa 0 o negativa', async () => {
    const { error } = await crearPersona({ mesa: 0 })
    expect(error).not.toBeNull()
  })

  it('rechaza referente con nombre vacío', async () => {
    const { error } = await admin.from('referentes').insert({ tipo: 'lider', nombre: '   ' })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────
describe('Vínculos e historial', () => {
  it('registra crear y editar en el historial', async () => {
    const { data: p } = await crearPersona()
    await admin.from('personas').update({ observaciones: 'editado en prueba' }).eq('id', p!.id)

    const { data: h } = await admin
      .from('historial').select('accion').eq('registro_id', p!.id)
    const acciones = (h ?? []).map((x) => x.accion)
    expect(acciones).toContain('crear')
    expect(acciones).toContain('editar')
  })

  it('vincula, impide duplicar el vínculo y registra desvincular', async () => {
    const { data: p } = await crearPersona()

    const v1 = await admin
      .from('vinculos').insert({ persona_id: p!.id, referente_id: referenteId })
      .select('id').single()
    expect(v1.error).toBeNull()

    const v2 = await admin
      .from('vinculos').insert({ persona_id: p!.id, referente_id: referenteId })
    expect(v2.error?.code).toBe('23505')

    await admin.from('vinculos').update({ activo: false }).eq('id', v1.data!.id)

    const { data: h } = await admin
      .from('historial').select('accion').eq('registro_id', v1.data!.id)
    const acciones = (h ?? []).map((x) => x.accion)
    expect(acciones).toContain('vincular')
    expect(acciones).toContain('desvincular')
  })

  it('el conteo del referente sube al vincular una persona', async () => {
    const antes = await admin
      .from('referentes_resumen').select('total_personas').eq('id', referenteId).single()
    const { data: p } = await crearPersona()
    await admin.from('vinculos').insert({ persona_id: p!.id, referente_id: referenteId })
    const despues = await admin
      .from('referentes_resumen').select('total_personas').eq('id', referenteId).single()
    expect(despues.data!.total_personas).toBe(antes.data!.total_personas + 1)
  })
})
