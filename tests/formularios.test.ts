import { describe, expect, it } from 'vitest'
import type { Catalogos } from '@/lib/catalogos'
import { leerPersona, leerReferente } from '@/lib/formularios'

const CAT: Catalogos = {
  barrio: ['San Martín', 'Primero de Mayo', '450 Años'],
  municipio: ['Valledupar', 'La Paz'],
  puesto_votacion: ['IE Leonidas Acuña'],
}

const fd = (datos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(datos)) f.set(k, v)
  return f
}
const UUID = '33c6de78-f4ef-4b0a-ac9a-a733dc0b7fb9'

describe('leerReferente', () => {
  it('nombre obligatorio', () => {
    expect(leerReferente(fd({ nombre: '   ' }), 'lider', CAT).errores).toHaveProperty('nombre')
  })

  it('valida la cédula', () => {
    const { errores } = leerReferente(fd({ nombre: 'Ana', cedula: '12A45' }), 'lider', CAT)
    expect(errores).toHaveProperty('cedula')
  })

  it('ya no guarda meta, notas, sector ni partido', () => {
    const { fila } = leerReferente(
      fd({ nombre: 'Ana', meta_personas: '10', notas: 'x', sector: 'Salud', partido_movimiento: 'P' }),
      'empresario',
      CAT,
    )
    for (const c of ['meta_personas', 'notas', 'sector', 'partido_movimiento']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  it('barrio y municipio: se toman de la lista, sin importar tildes ni mayúsculas', () => {
    const { errores, fila, nuevos } = leerReferente(
      fd({ nombre: 'Ana', barrio: '  san martin ', municipio: 'VALLEDUPAR' }),
      'lider',
      CAT,
    )
    expect(errores).toEqual({})
    expect(fila.barrio).toBe('San Martín')
    expect(fila.municipio).toBe('Valledupar')
    expect(nuevos).toEqual([])
  })

  it('barrio que no está en la lista: error si no se pidió agregarlo', () => {
    const { errores } = leerReferente(fd({ nombre: 'Ana', barrio: 'Los Músicos' }), 'lider', CAT)
    expect(errores.barrio).toMatch(/de la lista/)
  })

  it('barrio nuevo: se agrega limpio (sin espacios dobles)', () => {
    const { errores, fila, nuevos } = leerReferente(
      fd({ nombre: 'Ana', barrio: ' Los   Músicos ', barrio_nuevo: '1', municipio: 'Pueblo Bello', municipio_nuevo: '1' }),
      'lider',
      CAT,
    )
    expect(errores).toEqual({})
    expect(fila.barrio).toBe('Los Músicos')
    expect(nuevos).toEqual([
      { cat: 'barrio', nombre: 'Los Músicos' },
      { cat: 'municipio', nombre: 'Pueblo Bello' },
    ])
  })

  it('"nuevo" que ya existe con otra escritura: usa el de la lista y no lo duplica', () => {
    const { fila, nuevos } = leerReferente(fd({ nombre: 'Ana', barrio: 'SAN MARTÍN', barrio_nuevo: '1' }), 'lider', CAT)
    expect(fila.barrio).toBe('San Martín')
    expect(nuevos).toEqual([])
  })

  it('barrio nuevo no válido: muy corto o con caracteres raros', () => {
    expect(leerReferente(fd({ nombre: 'A', barrio: 'X', barrio_nuevo: '1' }), 'lider', CAT).errores).toHaveProperty('barrio')
    expect(leerReferente(fd({ nombre: 'A', barrio: 'Barrio <b>', barrio_nuevo: '1' }), 'lider', CAT).errores).toHaveProperty('barrio')
    expect(leerReferente(fd({ nombre: 'A', barrio: '1234', barrio_nuevo: '1' }), 'lider', CAT).errores).toHaveProperty('barrio')
  })

  it('empresa y zona: máximo 120 letras', () => {
    const largo = 'a'.repeat(121)
    expect(leerReferente(fd({ nombre: 'A', empresa: largo }), 'empresario', CAT).errores).toHaveProperty('empresa')
    expect(leerReferente(fd({ nombre: 'A', zona_influencia: largo }), 'aliado', CAT).errores).toHaveProperty('zona_influencia')
  })

  it('guarda celular y dirección (se capturan aunque no se muestren)', () => {
    const { fila } = leerReferente(
      fd({ nombre: 'Ana', celular: ' 3001234567 ', direccion: 'Calle 16 # 10-20' }),
      'lider',
      CAT,
    )
    expect(fila.celular).toBe('3001234567')
    expect(fila.direccion).toBe('Calle 16 # 10-20')
  })

  it('ya no guarda estado ni cargo', () => {
    const { fila } = leerReferente(fd({ nombre: 'Ana', estado: 'inactivo', cargo: 'Gerente', cargo_politico: 'Edil' }), 'empresario', CAT)
    for (const c of ['estado', 'cargo', 'cargo_politico']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  // La base exige que un referente solo tenga los campos de su tipo
  // (constraints campos_empresario y campos_aliado).
  const todosLosExtra = {
    nombre: 'Ana',
    empresa: 'Distribuidora El Valle',
    zona_influencia: 'Comuna 2',
  }

  it('líder: no lleva campos de empresario ni de aliado', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'lider', CAT)
    for (const c of ['empresa', 'zona_influencia']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  it('empresario: solo empresa', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'empresario', CAT)
    expect(fila).toMatchObject({ empresa: 'Distribuidora El Valle' })
    expect(fila).not.toHaveProperty('zona_influencia')
  })

  it('aliado: solo zona', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'aliado', CAT)
    expect(fila).toMatchObject({ zona_influencia: 'Comuna 2' })
    expect(fila).not.toHaveProperty('empresa')
  })

  it('campos del tipo vacíos se guardan como null', () => {
    const { fila } = leerReferente(fd({ nombre: 'Ana', empresa: '  ' }), 'empresario', CAT)
    expect(fila.empresa).toBeNull()
  })
})

describe('leerPersona', () => {
  const ahora = () => new Date('2026-11-04T15:00:00Z')

  it('barrio y puesto de votación: de la lista o nuevos', () => {
    const r = leerPersona(fd({ nombre: 'A', barrio: 'primero de mayo', puesto_votacion: 'ie leonidas acuna' }), false, CAT)
    expect(r.errores).toEqual({})
    expect(r.fila.barrio).toBe('Primero de Mayo')
    expect(r.fila.puesto_votacion).toBe('IE Leonidas Acuña')

    expect(leerPersona(fd({ nombre: 'A', puesto_votacion: 'Col. Nuevo' }), false, CAT).errores).toHaveProperty('puesto_votacion')
    const n = leerPersona(fd({ nombre: 'A', puesto_votacion: 'Col. Nuevo', puesto_votacion_nuevo: '1' }), false, CAT)
    expect(n.errores).toEqual({})
    expect(n.nuevos).toEqual([{ cat: 'puesto_votacion', nombre: 'Col. Nuevo' }])
  })

  it('persona válida mínima: solo nombre', () => {
    const { errores, fila } = leerPersona(fd({ nombre: 'María Pérez' }), false, CAT)
    expect(errores).toEqual({})
    expect(fila.cedula).toBeNull()
    expect(fila.mesa).toBeNull()
    expect(fila.autorizacion_datos).toBe(false)
    expect(fila.fecha_autorizacion).toBeNull()
  })

  it('rechaza nombre vacío, cédula con letras y mesa 0', () => {
    const { errores } = leerPersona(fd({ nombre: ' ', cedula: '12A45', mesa: '0' }), false, CAT)
    expect(Object.keys(errores).sort()).toEqual(['cedula', 'mesa', 'nombre'])
  })

  it('verificación: solo valores de la lista; vacío = sin verificar', () => {
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: 'Bogotá' }), false, CAT).errores)
      .toHaveProperty('municipio_verificacion')
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: 'No está en el censo' }), false, CAT).errores).toEqual({})
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: '' }), false, CAT).fila.municipio_verificacion).toBeNull()
  })

  it('celular se guarda tal cual (sin espacios a los lados); no hay validación de formato', () => {
    expect(leerPersona(fd({ nombre: 'A', celular: ' 300 123 4567 ' }), false, CAT).fila.celular).toBe('300 123 4567')
  })

  it('autorización sin fecha → la de hoy', () => {
    const { fila } = leerPersona(fd({ nombre: 'A', autorizacion_datos: 'on' }), false, CAT, ahora)
    expect(fila.autorizacion_datos).toBe(true)
    expect(fila.fecha_autorizacion).toBe('2026-11-04T15:00:00.000Z')
  })

  it('autorización con fecha → mediodía de ese día en hora de Colombia', () => {
    const { fila } = leerPersona(
      fd({ nombre: 'A', autorizacion_datos: 'on', fecha_autorizacion: '2026-10-20' }),
      false,
      CAT,
      ahora,
    )
    expect(fila.fecha_autorizacion).toBe('2026-10-20T12:00:00-05:00')
  })

  it('sin autorización se ignora la fecha', () => {
    const { fila } = leerPersona(fd({ nombre: 'A', fecha_autorizacion: '2026-10-20' }), false, CAT)
    expect(fila.fecha_autorizacion).toBeNull()
  })

  it('fecha de autorización mal escrita → error', () => {
    expect(
      leerPersona(fd({ nombre: 'A', autorizacion_datos: 'on', fecha_autorizacion: '20/10/2026' }), false, CAT).errores,
    ).toHaveProperty('fecha_autorizacion')
  })

  it('al crear: referente opcional, debe ser un id válido', () => {
    expect(leerPersona(fd({ nombre: 'A' }), false, CAT).referenteId).toBeNull()
    expect(leerPersona(fd({ nombre: 'A', referente_id: UUID }), false, CAT).referenteId).toBe(UUID)
    expect(leerPersona(fd({ nombre: 'A', referente_id: 'x; drop table' }), false, CAT).errores).toHaveProperty('referente_id')
  })

  it('al editar: se ignora el referente (se vincula desde la ficha)', () => {
    const r = leerPersona(fd({ nombre: 'A', referente_id: 'no-es-uuid' }), true, CAT)
    expect(r.referenteId).toBeNull()
    expect(r.errores).toEqual({})
  })

  it('coordinador opcional', () => {
    expect(leerPersona(fd({ nombre: 'A', coordinador: '  Paola Páramo ' }), false, CAT).coordinador).toBe('Paola Páramo')
    expect(leerPersona(fd({ nombre: 'A' }), false, CAT).coordinador).toBeNull()
  })
})
