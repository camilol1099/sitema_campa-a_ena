import { describe, expect, it } from 'vitest'
import type { Catalogos } from '@/lib/catalogos'
import {
  aplicarMapeo,
  clasificar,
  resumenParaAsistente,
  revisarMapeo,
  textoCelda,
  validarFilas,
  type Existentes,
  type Mapeo,
} from '@/lib/importacion'

// Sin red: todo en memoria.
const CAT: Catalogos = {
  barrio: ['San Martín', 'Primero de Mayo'],
  municipio: ['Valledupar'],
  puesto_votacion: ['IE Leonidas Acuña'],
}
const AHORA = () => new Date('2026-11-06T15:00:00Z')

const ENCABEZADOS = ['NOMBRE', 'CÉDULA', 'BARRIO', 'Puesto', 'Mesa', 'Municipio', 'Lider', 'Tipo']
const filas = [
  { NOMBRE: 'Ana Pérez', 'CÉDULA': "9'100.000.01", BARRIO: 'san martin', Puesto: 'IE LEONIDAS ACUÑA', Mesa: 12, Municipio: 'Valledupar', Lider: 'Rosa Daza', Tipo: 'Empresario' },
  { NOMBRE: 'Luis Gómez', 'CÉDULA': 910000002, BARRIO: 'Los Músicos', Puesto: '-', Mesa: '-', Municipio: 'No se encuentra en el censo', Lider: 'rosa daza', Tipo: 'Líder' },
  { NOMBRE: '', 'CÉDULA': null, BARRIO: null, Puesto: null, Mesa: null, Municipio: null, Lider: null, Tipo: null },
  { NOMBRE: 'Sin Cédula', 'CÉDULA': null, BARRIO: null, Puesto: null, Mesa: null, Municipio: null, Lider: 'Rosa Daza', Tipo: 'Empresario' },
]
const mapeo: Mapeo = {
  hoja: 'Hoja1',
  tipo: 'persona',
  columnas: { nombre: 'NOMBRE', cedula: 'CÉDULA', barrio: 'BARRIO', puesto_votacion: 'Puesto', mesa: 'Mesa', municipio_verificacion: 'Municipio' },
  vinculo: { modo: 'columna', columna: 'Lider' },
}
const EXISTENTES: Existentes = {
  personas: [{ id: 'p1', nombre: 'Marta Ruiz', cedula: '910000099' }],
  referentes: [{ id: 'r1', nombre: 'Rosa Daza', cedula: '910000050', tipo: 'lider' }],
}

describe('textoCelda', () => {
  it('números, fechas, vacíos y caracteres invisibles', () => {
    expect(textoCelda(1065845099)).toBe('1065845099')
    expect(textoCelda(null)).toBe('')
    expect(textoCelda(new Date('2023-05-01T00:00:00Z'))).toBe('2023-05-01')
    expect(textoCelda('‎316  7983494 ')).toBe('316 7983494')
  })
})

describe('revisarMapeo', () => {
  it('acepta un mapeo con columnas que existen', () => {
    expect(revisarMapeo(mapeo, ENCABEZADOS)).toEqual([])
  })
  it('avisa columnas inexistentes, campos que no aplican y falta de nombre', () => {
    const malo: Mapeo = { hoja: 'x', tipo: 'persona', columnas: { cedula: 'NO EXISTE', empresa: 'NOMBRE' } }
    const e = revisarMapeo(malo, ENCABEZADOS)
    expect(e.join(' ')).toMatch(/nombre/)
    expect(e.join(' ')).toMatch(/NO EXISTE/)
    expect(e.join(' ')).toMatch(/empresa/)
  })
  it('solo las personas se vinculan', () => {
    const m: Mapeo = { hoja: 'x', tipo: 'lider', columnas: { nombre: 'NOMBRE' }, vinculo: { modo: 'fijo', referente: 'Rosa' } }
    expect(revisarMapeo(m, ENCABEZADOS).join(' ')).toMatch(/vinculan/)
  })
})

describe('aplicarMapeo', () => {
  it('pasa columnas a campos, omite filas vacías y guarda el número de fila', () => {
    const r = aplicarMapeo(filas, mapeo)
    expect(r.map((f) => f.fila)).toEqual([1, 2, 4])
    expect(r[0]).toMatchObject({ datos: { nombre: 'Ana Pérez', mesa: '12' }, referente: 'Rosa Daza' })
    expect(r[2]!.datos).not.toHaveProperty('cedula')
  })
  it('vínculo fijo', () => {
    const r = aplicarMapeo(filas, { ...mapeo, vinculo: { modo: 'fijo', referente: 'Rosa Daza' } })
    expect(r.every((f) => f.referente === 'Rosa Daza')).toBe(true)
  })
  it('filtro: sin importar tildes ni mayúsculas', () => {
    const r = aplicarMapeo(filas, { ...mapeo, filtro: [{ columna: 'Tipo', operador: 'igual', valor: 'empresario' }] })
    expect(r.map((f) => f.fila)).toEqual([1, 4])
    const lideres = aplicarMapeo(filas, { ...mapeo, filtro: [{ columna: 'Tipo', operador: 'igual', valor: 'LIDER' }] })
    expect(lideres.map((f) => f.fila)).toEqual([2])
    const conCedula = aplicarMapeo(filas, { ...mapeo, filtro: [{ columna: 'CÉDULA', operador: 'no_vacio' }] })
    expect(conCedula.map((f) => f.fila)).toEqual([1, 2])
  })
})

describe('validarFilas (reglas de los formularios)', () => {
  const mapeadas = aplicarMapeo(filas, mapeo)

  it('cédula solo dígitos, catálogos de la lista, "-" vacío y verificación equivalente', () => {
    const { validas, problemas } = validarFilas(mapeadas, 'persona', CAT, { ahora: AHORA })
    expect(problemas).toEqual([])
    const [ana, luis] = validas
    expect(ana!.registro).toMatchObject({ cedula: '910000001', barrio: 'San Martín', puesto_votacion: 'IE Leonidas Acuña', mesa: 12, municipio_verificacion: 'Valledupar' })
    // Barrio nuevo: se agrega con mayúscula inicial, como en el formulario.
    expect(luis!.registro).toMatchObject({ barrio: 'Los Músicos', puesto_votacion: null, mesa: null, municipio_verificacion: 'No está en el censo' })
    expect(luis!.nuevos).toEqual([{ cat: 'barrio', nombre: 'Los Músicos' }])
  })

  it('autorización solo si el usuario lo indicó', () => {
    const sin = validarFilas(mapeadas, 'persona', CAT, { ahora: AHORA }).validas[0]!
    expect(sin.registro).toMatchObject({ autorizacion_datos: false, fecha_autorizacion: null })
    const con = validarFilas(mapeadas, 'persona', CAT, { todasAutorizaron: true, ahora: AHORA }).validas[0]!
    expect(con.registro).toMatchObject({ autorizacion_datos: true, fecha_autorizacion: '2026-11-06T15:00:00.000Z' })
  })

  it('filas con problemas, con el motivo', () => {
    const { validas, problemas } = validarFilas(
      [
        { fila: 1, datos: { nombre: 'Ana', cedula: 'ABC' } },
        { fila: 2, datos: { nombre: 'Beto', cedula: '123' } },
        { fila: 3, datos: { nombre: 'Caro', mesa: 'cero' } },
        { fila: 4, datos: { nombre: 'Dani', municipio_verificacion: 'Bogotá' } },
        { fila: 5, datos: { cedula: '910000007' } },
      ],
      'persona',
      CAT,
    )
    expect(validas).toEqual([])
    expect(problemas.map((p) => p.fila)).toEqual([1, 2, 3, 4, 5])
    expect(problemas[0]!.motivo).toMatch(/solo puede tener números/)
    expect(problemas[1]!.motivo).toMatch(/entre 6 y 10/)
    expect(problemas[2]!.motivo).toMatch(/números/)
    expect(problemas[3]!.motivo).toMatch(/Verificación/)
    expect(problemas[4]!.motivo).toMatch(/nombre/)
  })

  it('referentes: solo los campos de su tipo', () => {
    const { validas } = validarFilas([{ fila: 1, datos: { nombre: 'Clínica', empresa: 'Sonrisa SAS', zona_influencia: 'Norte' } }], 'empresario', CAT)
    expect(validas[0]!.registro).toMatchObject({ tipo: 'empresario', empresa: 'Sonrisa SAS' })
    expect(validas[0]!.registro).not.toHaveProperty('zona_influencia')
  })
})

describe('clasificar (ya existentes y repetidos)', () => {
  const valida = (fila: number, nombre: string, cedula: string | null, referente: string | null = 'Rosa Daza') => {
    const { validas } = validarFilas([{ fila, datos: cedula ? { nombre, cedula } : { nombre }, referente }], 'persona', CAT)
    return validas[0]!
  }

  it('existente por cédula, aunque el nombre esté escrito distinto', () => {
    const c = clasificar([valida(1, 'MARTA R.', '910000099')], EXISTENTES)
    expect(c.nuevos).toEqual([])
    expect(c.existentes[0]).toMatchObject({ fila: 1, motivo: expect.stringMatching(/persona \(Marta Ruiz\)/) })
  })

  it('sin cédula: existente por nombre normalizado', () => {
    const c = clasificar([valida(1, '  marta   RUIZ ', null)], EXISTENTES)
    expect(c.existentes).toHaveLength(1)
  })

  it('nadie es persona y líder a la vez: la cédula de un líder cuenta como existente', () => {
    const c = clasificar([valida(1, 'Rosa', '910000050')], EXISTENTES)
    expect(c.existentes[0]!.motivo).toMatch(/líder/)
  })

  it('repetidos dentro del archivo: el segundo queda con problema', () => {
    const c = clasificar([valida(1, 'Ana', '910000001'), valida(2, 'Ana B', '910000001'), valida(3, 'Pedro', null), valida(4, 'pedro', null)], EXISTENTES)
    expect(c.nuevos.map((n) => n.fila)).toEqual([1, 3])
    expect(c.problemas.map((p) => [p.fila, p.motivo])).toEqual([
      [2, 'Cédula repetida en el archivo (fila 1).'],
      [4, 'Nombre repetido en el archivo sin cédula (fila 3).'],
    ])
  })

  it('vincula al referente por nombre (sin tildes ni mayúsculas) o por id; si no existe, problema', () => {
    const c = clasificar(
      [valida(1, 'Ana', '910000001', 'ROSA DAZA'), valida(2, 'Beto', '910000002', 'r1'), valida(3, 'Caro', '910000003', 'Nadie')],
      EXISTENTES,
    )
    expect(c.nuevos.map((n) => n.referenteId)).toEqual(['r1', 'r1'])
    expect(c.problemas[0]).toMatchObject({ fila: 3, motivo: 'No existe el referente "Nadie".' })
  })

  it('nombre de referente repetido: ambiguo', () => {
    const dos: Existentes = {
      personas: [],
      referentes: [
        { id: 'a', nombre: 'Juan', cedula: null, tipo: 'lider' },
        { id: 'b', nombre: 'juan', cedula: null, tipo: 'empresario' },
      ],
    }
    expect(clasificar([valida(1, 'Ana', '910000001', 'Juan')], dos).problemas[0]!.motivo).toMatch(/varios/)
  })

  it('resumen para el asistente: máximo 30 problemas y sin datos personales extra', () => {
    const muchas = Array.from({ length: 40 }, (_, i) => valida(i + 1, 'Igual', null))
    const r = resumenParaAsistente(clasificar(muchas, EXISTENTES))
    expect(r).toMatchObject({ nuevos: 1, ya_existentes: 0, con_problemas: 39 })
    expect(r.problemas).toHaveLength(30)
    expect(Object.keys(r.problemas[0]!)).toEqual(['fila', 'motivo'])
  })
})
