import { describe, expect, it } from 'vitest'
import { alertasPersona } from '@/lib/alertas'
import { coordinadoresDistintos, cuantosCumplenMeta, datosFichaReferente, porcentajeMeta } from '@/lib/fichas'
import { filtrarReferentes, sinTildes } from '@/lib/filtros'
import type { ReferenteFicha } from '@/lib/tipos'

describe('sinTildes', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(sinTildes('Jesús Perpiñán')).toBe('jesus perpinan')
    expect(sinTildes('ÓSCAR')).toBe('oscar')
  })
})

describe('filtrarReferentes', () => {
  const refs = [
    { nombre: 'Rosa Elena Daza', estado: 'activo' as const, total_personas: 10 },
    { nombre: 'Óscar Iván Rodríguez', estado: 'inactivo' as const, total_personas: 0 },
    { nombre: 'Jorge Luis Oñate', estado: 'activo' as const, total_personas: 30 },
    { nombre: 'Ana Ariza', estado: 'activo' as const, total_personas: 10 },
  ]
  const nombres = (r: { nombre: string }[]) => r.map((x) => x.nombre)

  it('activos: ordenados por personas y luego por nombre', () => {
    expect(nombres(filtrarReferentes(refs, '', 'activos'))).toEqual([
      'Jorge Luis Oñate',
      'Ana Ariza',
      'Rosa Elena Daza',
    ])
  })
  it('inactivos y todos', () => {
    expect(nombres(filtrarReferentes(refs, '', 'inactivos'))).toEqual(['Óscar Iván Rodríguez'])
    expect(filtrarReferentes(refs, '', 'todos')).toHaveLength(4)
  })
  it('por nombre, sin importar tildes ni mayúsculas', () => {
    expect(nombres(filtrarReferentes(refs, 'oscar', 'todos'))).toEqual(['Óscar Iván Rodríguez'])
    expect(nombres(filtrarReferentes(refs, '  OÑATE ', 'activos'))).toEqual(['Jorge Luis Oñate'])
  })
  it('combina nombre y estado', () => {
    expect(filtrarReferentes(refs, 'oscar', 'activos')).toEqual([])
  })
  it('no modifica la lista original', () => {
    const copia = [...refs]
    filtrarReferentes(refs, '', 'todos')
    expect(refs).toEqual(copia)
  })
})

describe('meta', () => {
  it('porcentajeMeta: sin meta 0, tope 100', () => {
    expect(porcentajeMeta(10, null)).toBe(0)
    expect(porcentajeMeta(10, 0)).toBe(0)
    expect(porcentajeMeta(15, 30)).toBe(50)
    expect(porcentajeMeta(61, 25)).toBe(100)
  })
  it('cuantosCumplenMeta: los que no tienen meta no cuentan', () => {
    expect(
      cuantosCumplenMeta([
        { meta_personas: 25, total_personas: 61 },
        { meta_personas: 30, total_personas: 30 },
        { meta_personas: 40, total_personas: 22 },
        { meta_personas: null, total_personas: 8 },
      ]),
    ).toBe(2)
  })
})

describe('ficha corta del referente', () => {
  const base: ReferenteFicha = {
    id: '1', tipo: 'lider', nombre: 'Rosa', cedula: '1065100001', barrio: 'Fundadores', municipio: 'Valledupar',
    estado: 'activo', meta_personas: 60, notas: null,
    empresa: null, sector: null, cargo: null, partido_movimiento: null, cargo_politico: null, zona_influencia: null,
  }

  it('coordinadoresDistintos: sin repetidos ni vacíos', () => {
    expect(
      coordinadoresDistintos([{ coordinador: 'Paola' }, { coordinador: null }, { coordinador: 'Paola' }, { coordinador: 'Elvis' }]),
    ).toEqual(['Paola', 'Elvis'])
  })

  it('líder → barrio, estado, coordinadores', () => {
    expect(datosFichaReferente(base, ['Paola', 'Elvis'])).toEqual([
      ['Barrio', 'Fundadores'],
      ['Estado', 'Activo'],
      ['Coordinadores', '2'],
    ])
    expect(datosFichaReferente({ ...base, estado: 'inactivo' }, [])).toEqual([
      ['Barrio', 'Fundadores'],
      ['Estado', 'Inactivo'],
      ['Coordinadores', null],
    ])
  })

  it('empresario → empresa, sector, cargo', () => {
    const r = { ...base, tipo: 'empresario' as const, empresa: 'Clínica Sonrisa', sector: 'Salud', cargo: 'Propietaria' }
    expect(datosFichaReferente(r, [])).toEqual([
      ['Empresa', 'Clínica Sonrisa'],
      ['Sector', 'Salud'],
      ['Cargo', 'Propietaria'],
    ])
  })

  it('aliado → partido, cargo político, zona', () => {
    const r = { ...base, tipo: 'aliado' as const, partido_movimiento: 'Partido Verde', cargo_politico: 'Edil', zona_influencia: 'Comuna 5' }
    expect(datosFichaReferente(r, []).map(([k]) => k)).toEqual(['Partido o movimiento', 'Cargo político', 'Zona de influencia'])
  })

  it('nunca muestra dirección ni teléfono, aunque vengan en el objeto', () => {
    const conContacto = { ...base, celular: '3000000101', direccion: 'Calle 16 # 10-20' } as ReferenteFicha
    for (const tipo of ['lider', 'empresario', 'aliado'] as const) {
      const texto = JSON.stringify(datosFichaReferente({ ...conContacto, tipo }, []))
      expect(texto).not.toMatch(/3000000101|Calle 16|Celular|Dirección|Teléfono/i)
    }
  })
})

describe('alertasPersona', () => {
  const ok = { sin_cedula: false, num_referentes: 1, municipio_verificacion: 'Valledupar' as const, barrio: 'Fundadores' }

  it('persona completa → sin alertas', () => {
    expect(alertasPersona(ok)).toEqual([])
  })
  it('sin cédula (aviso) y 2 referentes (nota)', () => {
    expect(alertasPersona({ ...ok, sin_cedula: true, num_referentes: 2 })).toEqual([
      { tono: 'aviso', texto: 'Sin cédula' },
      { tono: 'nota', texto: '2 referentes' },
    ])
  })
  it('sin verificar (gris) vs. no vota aquí (aviso)', () => {
    expect(alertasPersona({ ...ok, municipio_verificacion: null })).toEqual([{ tono: 'gris', texto: 'Sin verificar' }])
    expect(alertasPersona({ ...ok, municipio_verificacion: 'No vota en el municipio' })).toEqual([
      { tono: 'aviso', texto: 'No vota aquí' },
    ])
  })
  it('sin barrio, incluso si es solo espacios', () => {
    expect(alertasPersona({ ...ok, barrio: '  ' })).toEqual([{ tono: 'gris', texto: 'Sin barrio' }])
    expect(alertasPersona({ ...ok, barrio: null })).toEqual([{ tono: 'gris', texto: 'Sin barrio' }])
  })
  it('orden de importancia con todas las alertas', () => {
    const todas = alertasPersona({ sin_cedula: true, num_referentes: 3, municipio_verificacion: null, barrio: null })
    expect(todas.map((a) => a.texto)).toEqual(['Sin cédula', '3 referentes', 'Sin verificar', 'Sin barrio'])
  })
})
