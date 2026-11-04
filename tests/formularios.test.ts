import { describe, expect, it } from 'vitest'
import { leerPersona, leerReferente } from '@/lib/formularios'

const fd = (datos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(datos)) f.set(k, v)
  return f
}
const UUID = '33c6de78-f4ef-4b0a-ac9a-a733dc0b7fb9'

describe('leerReferente', () => {
  it('nombre obligatorio', () => {
    expect(leerReferente(fd({ nombre: '   ' }), 'lider').errores).toHaveProperty('nombre')
  })

  it('valida cédula y meta', () => {
    const { errores } = leerReferente(fd({ nombre: 'Ana', cedula: '12A45', meta_personas: '-1' }), 'lider')
    expect(errores).toHaveProperty('cedula')
    expect(errores).toHaveProperty('meta_personas')
  })

  it('meta 0 es válida (≥ 0)', () => {
    const { errores, fila } = leerReferente(fd({ nombre: 'Ana', meta_personas: '0' }), 'lider')
    expect(errores).toEqual({})
    expect(fila.meta_personas).toBe(0)
  })

  it('guarda celular y dirección (se capturan aunque no se muestren)', () => {
    const { fila } = leerReferente(
      fd({ nombre: 'Ana', celular: ' 3001234567 ', direccion: 'Calle 16 # 10-20' }),
      'lider',
    )
    expect(fila.celular).toBe('3001234567')
    expect(fila.direccion).toBe('Calle 16 # 10-20')
  })

  it('estado: solo "inactivo" lo inactiva; cualquier otro valor → activo', () => {
    expect(leerReferente(fd({ nombre: 'Ana', estado: 'inactivo' }), 'lider').fila.estado).toBe('inactivo')
    expect(leerReferente(fd({ nombre: 'Ana', estado: 'raro' }), 'lider').fila.estado).toBe('activo')
    expect(leerReferente(fd({ nombre: 'Ana' }), 'lider').fila.estado).toBe('activo')
  })

  // La base exige que un referente solo tenga los campos de su tipo
  // (constraints campos_empresario y campos_aliado).
  const todosLosExtra = {
    nombre: 'Ana',
    empresa: 'Distribuidora El Valle',
    sector: 'Comercio',
    cargo: 'Gerente',
    partido_movimiento: 'Partido Verde',
    cargo_politico: 'Edil',
    zona_influencia: 'Comuna 2',
  }

  it('líder: no lleva campos de empresario ni de aliado', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'lider')
    for (const c of ['empresa', 'sector', 'cargo', 'partido_movimiento', 'cargo_politico', 'zona_influencia']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  it('empresario: solo empresa, sector y cargo', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'empresario')
    expect(fila).toMatchObject({ empresa: 'Distribuidora El Valle', sector: 'Comercio', cargo: 'Gerente' })
    for (const c of ['partido_movimiento', 'cargo_politico', 'zona_influencia']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  it('aliado: solo partido, cargo político y zona', () => {
    const { fila } = leerReferente(fd(todosLosExtra), 'aliado')
    expect(fila).toMatchObject({ partido_movimiento: 'Partido Verde', cargo_politico: 'Edil', zona_influencia: 'Comuna 2' })
    for (const c of ['empresa', 'sector', 'cargo']) {
      expect(fila).not.toHaveProperty(c)
    }
  })

  it('campos del tipo vacíos se guardan como null', () => {
    const { fila } = leerReferente(fd({ nombre: 'Ana', empresa: '  ' }), 'empresario')
    expect(fila.empresa).toBeNull()
  })
})

describe('leerPersona', () => {
  const ahora = () => new Date('2026-11-04T15:00:00Z')

  it('persona válida mínima: solo nombre', () => {
    const { errores, fila } = leerPersona(fd({ nombre: 'María Pérez' }), false)
    expect(errores).toEqual({})
    expect(fila.cedula).toBeNull()
    expect(fila.mesa).toBeNull()
    expect(fila.autorizacion_datos).toBe(false)
    expect(fila.fecha_autorizacion).toBeNull()
  })

  it('rechaza nombre vacío, cédula con letras y mesa 0', () => {
    const { errores } = leerPersona(fd({ nombre: ' ', cedula: '12A45', mesa: '0' }), false)
    expect(Object.keys(errores).sort()).toEqual(['cedula', 'mesa', 'nombre'])
  })

  it('verificación: solo valores de la lista; vacío = sin verificar', () => {
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: 'Bogotá' }), false).errores)
      .toHaveProperty('municipio_verificacion')
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: 'No está en el censo' }), false).errores).toEqual({})
    expect(leerPersona(fd({ nombre: 'A', municipio_verificacion: '' }), false).fila.municipio_verificacion).toBeNull()
  })

  it('celular se guarda tal cual (sin espacios a los lados); no hay validación de formato', () => {
    expect(leerPersona(fd({ nombre: 'A', celular: ' 300 123 4567 ' }), false).fila.celular).toBe('300 123 4567')
  })

  it('autorización sin fecha → la de hoy', () => {
    const { fila } = leerPersona(fd({ nombre: 'A', autorizacion_datos: 'on' }), false, ahora)
    expect(fila.autorizacion_datos).toBe(true)
    expect(fila.fecha_autorizacion).toBe('2026-11-04T15:00:00.000Z')
  })

  it('autorización con fecha → mediodía de ese día en hora de Colombia', () => {
    const { fila } = leerPersona(
      fd({ nombre: 'A', autorizacion_datos: 'on', fecha_autorizacion: '2026-10-20' }),
      false,
      ahora,
    )
    expect(fila.fecha_autorizacion).toBe('2026-10-20T12:00:00-05:00')
  })

  it('sin autorización se ignora la fecha', () => {
    const { fila } = leerPersona(fd({ nombre: 'A', fecha_autorizacion: '2026-10-20' }), false)
    expect(fila.fecha_autorizacion).toBeNull()
  })

  it('fecha de autorización mal escrita → error', () => {
    expect(
      leerPersona(fd({ nombre: 'A', autorizacion_datos: 'on', fecha_autorizacion: '20/10/2026' }), false).errores,
    ).toHaveProperty('fecha_autorizacion')
  })

  it('al crear: referente opcional, debe ser un id válido', () => {
    expect(leerPersona(fd({ nombre: 'A' }), false).referenteId).toBeNull()
    expect(leerPersona(fd({ nombre: 'A', referente_id: UUID }), false).referenteId).toBe(UUID)
    expect(leerPersona(fd({ nombre: 'A', referente_id: 'x; drop table' }), false).errores).toHaveProperty('referente_id')
  })

  it('al editar: se ignora el referente (se vincula desde la ficha)', () => {
    const r = leerPersona(fd({ nombre: 'A', referente_id: 'no-es-uuid' }), true)
    expect(r.referenteId).toBeNull()
    expect(r.errores).toEqual({})
  })

  it('coordinador opcional', () => {
    expect(leerPersona(fd({ nombre: 'A', coordinador: '  Paola Páramo ' }), false).coordinador).toBe('Paola Páramo')
    expect(leerPersona(fd({ nombre: 'A' }), false).coordinador).toBeNull()
  })
})
