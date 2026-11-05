import { describe, expect, it } from 'vitest'
import { alertasPersona } from '@/lib/alertas'
import { coordinadoresDistintos, datosFichaReferente } from '@/lib/fichas'
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
    { nombre: 'Rosa Elena Daza', total_personas: 10 },
    { nombre: 'Óscar Iván Rodríguez', total_personas: 0 },
    { nombre: 'Jorge Luis Oñate', total_personas: 30 },
    { nombre: 'Ana Ariza', total_personas: 10 },
  ]
  const nombres = (r: { nombre: string }[]) => r.map((x) => x.nombre)

  it('ordenados por personas y luego por nombre', () => {
    expect(nombres(filtrarReferentes(refs, ''))).toEqual([
      'Jorge Luis Oñate',
      'Ana Ariza',
      'Rosa Elena Daza',
      'Óscar Iván Rodríguez',
    ])
  })
  it('por nombre, sin importar tildes ni mayúsculas', () => {
    expect(nombres(filtrarReferentes(refs, 'oscar'))).toEqual(['Óscar Iván Rodríguez'])
    expect(nombres(filtrarReferentes(refs, '  OÑATE '))).toEqual(['Jorge Luis Oñate'])
  })
  it('no modifica la lista original', () => {
    const copia = [...refs]
    filtrarReferentes(refs, '')
    expect(refs).toEqual(copia)
  })
})

describe('ficha corta del referente', () => {
  const base: ReferenteFicha = {
    id: '1', tipo: 'lider', nombre: 'Rosa', cedula: '1065100001', barrio: 'Fundadores', municipio: 'Valledupar',
    empresa: null, zona_influencia: null,
  }

  it('coordinadoresDistintos: sin repetidos ni vacíos', () => {
    expect(
      coordinadoresDistintos([{ coordinador: 'Paola' }, { coordinador: null }, { coordinador: 'Paola' }, { coordinador: 'Elvis' }]),
    ).toEqual(['Paola', 'Elvis'])
  })

  it('líder → barrio, coordinadores', () => {
    expect(datosFichaReferente(base, ['Paola', 'Elvis'])).toEqual([
      ['Barrio', 'Fundadores'],
      ['Coordinadores', '2'],
    ])
    expect(datosFichaReferente(base, [])).toEqual([
      ['Barrio', 'Fundadores'],
      ['Coordinadores', null],
    ])
  })

  it('empresario → empresa', () => {
    const r = { ...base, tipo: 'empresario' as const, empresa: 'Clínica Sonrisa' }
    expect(datosFichaReferente(r, [])).toEqual([['Empresa', 'Clínica Sonrisa']])
  })

  it('aliado → zona', () => {
    const r = { ...base, tipo: 'aliado' as const, zona_influencia: 'Comuna 5' }
    expect(datosFichaReferente(r, [])).toEqual([['Zona de influencia', 'Comuna 5']])
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
