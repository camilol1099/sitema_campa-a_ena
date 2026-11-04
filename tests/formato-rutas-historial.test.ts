import { describe, expect, it } from 'vitest'
import { EJES, esSlugEje, esUuid, nombreTipo, slugDeTipo } from '@/lib/ejes'
import { fecha, fechaConHora, fmt, iniciales, tono } from '@/lib/formato'
import { describirCambio } from '@/lib/historial'
import { rutaPersona, rutaReferente } from '@/lib/rutas'
import type { EventoHistorial } from '@/lib/tipos'

// Intl usa espacios especiales (no separables); se normalizan para comparar.
const plano = (t: string) => t.replace(/[  ]/g, ' ')

describe('formato', () => {
  it('fmt: separador de miles colombiano', () => {
    expect(fmt(1981)).toBe('1.981')
    expect(fmt(300)).toBe('300')
  })
  it('iniciales: dos primeras palabras, en mayúscula', () => {
    expect(iniciales('Rosa Elena Daza Maestre')).toBe('RE')
    expect(iniciales('  óscar   iván ')).toBe('ÓI')
    expect(iniciales('Yesenia')).toBe('Y')
  })
  it('tono: estable para el mismo id y entre 0 y 359', () => {
    const id = 'c9a6589b-5497-40a1-80cc-3c904fc65a82'
    expect(tono(id)).toBe(tono(id))
    expect(tono(id)).toBeGreaterThanOrEqual(0)
    expect(tono(id)).toBeLessThan(360)
  })
  it('fecha: una fecha sin hora no se corre de día', () => {
    expect(plano(fecha('2026-11-04'))).toBe('4 de nov de 2026')
  })
  it('fechaConHora: en hora de Colombia (UTC−5)', () => {
    // 05:23 UTC = 00:23 en Colombia
    expect(plano(fechaConHora('2026-11-04T05:23:34Z'))).toBe('4 de nov, 12:23 a. m.')
  })
})

describe('ejes', () => {
  it('slug ↔ tipo', () => {
    expect(slugDeTipo('lider')).toBe('lideres')
    expect(slugDeTipo('empresario')).toBe('empresarios')
    expect(slugDeTipo('aliado')).toBe('aliados')
    for (const [slug, conf] of Object.entries(EJES)) expect(slugDeTipo(conf.tipo)).toBe(slug)
  })
  it('esSlugEje solo acepta los tres ejes (ni propiedades heredadas: antes /constructor daba 500)', () => {
    expect(esSlugEje('lideres')).toBe(true)
    expect(esSlugEje('admins')).toBe(false)
    expect(esSlugEje('constructor')).toBe(false)
    expect(esSlugEje('toString')).toBe(false)
    expect(esSlugEje('__proto__')).toBe(false)
  })
  it('nombreTipo en mayúscula inicial', () => {
    expect(nombreTipo('lider')).toBe('Líder')
    expect(nombreTipo('aliado')).toBe('Aliado')
  })
  it('esUuid', () => {
    expect(esUuid('33c6de78-f4ef-4b0a-ac9a-a733dc0b7fb9')).toBe(true)
    expect(esUuid('33c6de78')).toBe(false)
    expect(esUuid("1' or '1'='1")).toBe(false)
    expect(esUuid(undefined)).toBe(false)
    expect(esUuid(['33c6de78-f4ef-4b0a-ac9a-a733dc0b7fb9'])).toBe(false)
  })
})

describe('rutas', () => {
  it('rutaReferente', () => {
    expect(rutaReferente('empresario', 'R1')).toBe('/empresarios?referente=R1')
  })
  it('rutaPersona con y sin referente', () => {
    expect(rutaPersona('P1', { id: 'R1', tipo: 'aliado' })).toBe('/aliados?referente=R1&persona=P1')
    expect(rutaPersona('P1', null)).toBe('/lideres?persona=P1')
    expect(rutaPersona('P1')).toBe('/lideres?persona=P1')
  })
})

describe('describirCambio (historial)', () => {
  const nombres = new Map([['R1', 'Ramiro Gutiérrez Molina']])
  const ev = (e: Partial<EventoHistorial>): EventoHistorial => ({
    id: 1, tabla: 'personas', registro_id: 'P1', accion: 'editar', cambios: null, fecha: '2026-11-04T05:23:34Z', ...e,
  })

  it('crear persona', () => {
    expect(describirCambio(ev({ accion: 'crear', cambios: { despues: { nombre: 'A' } } }), nombres)).toBe('Registro creado')
  })
  it('editar persona: lista los campos que cambiaron, sin los técnicos', () => {
    const e = ev({
      cambios: {
        antes: { mesa: null, puesto_votacion: null, barrio: 'Novalito', updated_at: '1' },
        despues: { mesa: 12, puesto_votacion: 'IE Leonidas Acuña', barrio: 'Novalito', updated_at: '2' },
      },
    })
    expect(describirCambio(e, nombres)).toBe('Se editó: mesa, puesto')
  })
  it('vincular / desvincular con el nombre del referente', () => {
    const despues = { referente_id: 'R1', activo: true }
    expect(describirCambio(ev({ tabla: 'vinculos', accion: 'vincular', cambios: { despues } }), nombres))
      .toBe('Se vinculó a Ramiro Gutiérrez Molina')
    expect(describirCambio(ev({ tabla: 'vinculos', accion: 'desvincular', cambios: { antes: despues, despues: { ...despues, activo: false } } }), nombres))
      .toBe('Se desvinculó de Ramiro Gutiérrez Molina')
  })
  it('reactivar un vínculo', () => {
    const e = ev({ tabla: 'vinculos', accion: 'editar', cambios: { antes: { referente_id: 'R1', activo: false }, despues: { referente_id: 'R1', activo: true } } })
    expect(describirCambio(e, nombres)).toBe('Se volvió a vincular a Ramiro Gutiérrez Molina')
  })
  it('editar vínculo (coordinador) y referente desconocido', () => {
    const e = ev({ tabla: 'vinculos', accion: 'editar', cambios: { antes: { referente_id: 'R9', coordinador: null }, despues: { referente_id: 'R9', coordinador: 'Paola' } } })
    expect(describirCambio(e, nombres)).toBe('Se editó el vínculo con un referente: coordinador')
  })
})
