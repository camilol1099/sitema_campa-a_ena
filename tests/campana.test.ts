/**
 * Formato de Excel de la campaña (docs/FORMATO_EXCEL.md). Sin red: datos ficticios.
 */
import { describe, expect, it } from 'vitest'
import type { Catalogos } from '@/lib/catalogos'
import {
  analizarCampana,
  detectarFormatoCampana,
  filasCampana,
  parecidos,
  resumenPlan,
  type ExistentesCampana,
  type OpcionesCampana,
} from '@/lib/campana'
import { normalizar } from '@/lib/importacion'

const CAT: Catalogos = { barrio: ['Panamá'], municipio: ['Valledupar'], puesto_votacion: ['IE Leonidas Acuña'] }

// Encabezados en otro orden, con mayúsculas, tildes y espacios distintos.
const ENC = ['Lider', 'NOMBRE', 'CÉDULA ', 'CELULAR', 'BARRIO', 'Puesto de Votación', 'Mesa', 'municipio', 'Coordinador', '#', 'DIRECCION']
const fila = (lider: string | null, nombre: string, cedula: unknown = null, extra: Record<string, unknown> = {}) => ({
  Lider: lider, NOMBRE: nombre, 'CÉDULA ': cedula, CELULAR: null, BARRIO: null, 'Puesto de Votación': null,
  Mesa: null, municipio: null, Coordinador: null, '#': null, DIRECCION: null, ...extra,
})

// Fixture: filas de la hoja (la primera de datos es la fila 9 del Excel, como en el real).
const HOJA = [
  // Líder con su propia fila (NOMBRE == Lider, distinta grafía) y 4 personas
  fila('Ana Lider Prueba', 'ANA LÍDER PRUEBA', 9100000010, { BARRIO: 'panama', Mesa: 3, municipio: 'Valledupar', Coordinador: 'Coord Uno', CELULAR: '300 000 0010' }),
  fila('Ana Lider Prueba', 'Persona Uno', '1.065.821.234', { Coordinador: 'Coord Dos', 'Puesto de Votación': 'IE LEONIDAS ACUÑA', Mesa: 12 }),
  fila('Ana Lider Prueba', 'Persona Dos', 9100000012, { municipio: 'No se encuentra en el censo', Mesa: '-', 'Puesto de Votación': '-' }),
  fila('Ana Lider Prueba', 'Persona Tres', 9100000013),
  fila('ana lider prueba', 'Persona Cuatro'), // mismo líder en minúsculas, sin cédula
  // Líder sin fila propia
  fila('Beto Sin Fila', 'Persona Cinco', 9100000020),
  // Líder que ya existe sin cédula → a completar
  fila('Lider Existente Sin Cedula', 'Lider Existente Sin Cedula', 9100000030, { BARRIO: 'Panamá', Mesa: 7 }),
  fila('Lider Existente Sin Cedula', 'Persona Seis', 9100000031),
  // Líder que ya existe con otra cédula → problema; su persona se vincula al existente
  fila('Lider Otra Cedula', 'LIDER OTRA CEDULA', 9100000040),
  fila('Lider Otra Cedula', 'Persona Siete', 9100000041),
  // Nombre parecido a uno existente ("Pedro Molina") → duda
  fila('Pedro Molinas', 'Persona Ocho', 9100000070),
  fila('Pedro Molinas', 'Persona Nueve', 9100000071),
  // Persona que es líder bajo otro líder (por nombre y por cédula) → aviso, no se crea
  fila('Ana Lider Prueba', 'Beto Sin Fila', 9100000099),
  fila('Beto Sin Fila', 'Otra Persona', 9100000010),
  // Cédula de 11 dígitos → problema
  fila('Ana Lider Prueba', 'Persona Once Digitos', '10457122324'),
  // Cédula repetida en el archivo → problema en la segunda
  fila('Ana Lider Prueba', 'Persona Repetida A', 9100000050),
  fila('Ana Lider Prueba', 'Persona Repetida B', 9100000050),
  // Persona sin líder ("-" = sin dato)
  fila('-', 'Persona Sin Lider', 9100000060),
  // Ya existe con otro líder → aviso, se omite
  fila('Ana Lider Prueba', 'Persona Existente', 9300000001),
  // Cédula sospechosa (9 dígitos que empiezan por 10) → se importa con aviso
  fila('Ana Lider Prueba', 'Persona Cedula Corta', 106582123),
  // Fila vacía (se ignora)
  fila(null, ''),
]

const EXISTENTES: ExistentesCampana = {
  referentes: [
    { id: 'r1', tipo: 'lider', nombre: 'Lider Existente Sin Cedula', cedula: null, celular: null, direccion: null, barrio: null, puesto_votacion: null, mesa: null, municipio_verificacion: null, coordinador: 'Ya Tiene' },
    { id: 'r2', tipo: 'lider', nombre: 'Lider Otra Cedula', cedula: '9200000002', celular: null, direccion: null, barrio: null, puesto_votacion: null, mesa: null, municipio_verificacion: null, coordinador: null },
    { id: 'r3', tipo: 'lider', nombre: 'Pedro Molina', cedula: null, celular: null, direccion: null, barrio: null, puesto_votacion: null, mesa: null, municipio_verificacion: null, coordinador: null },
    { id: 'r4', tipo: 'lider', nombre: 'Lider Con Persona', cedula: '9200000004', celular: null, direccion: null, barrio: null, puesto_votacion: null, mesa: null, municipio_verificacion: null, coordinador: null },
  ],
  personas: [{ id: 'p1', nombre: 'Persona Existente', cedula: '9300000001', referentes: [{ id: 'r4', nombre: 'Lider Con Persona' }] }],
}

const columnas = detectarFormatoCampana(ENC)!
const FILAS = filasCampana(HOJA, columnas, 9)
const analizar = (op: OpcionesCampana = {}) => analizarCampana(FILAS, EXISTENTES, CAT, op)
const nombres = (xs: { nombre: string }[]) => xs.map((x) => x.nombre)
const porNombre = (xs: { nombre: string; detalle: string }[], n: string) => xs.find((x) => x.nombre === n)?.detalle

describe('reconocer el formato', () => {
  it('sin importar orden, tildes, mayúsculas ni espacios', () => {
    expect(columnas).toMatchObject({ nombre: 'NOMBRE', cedula: 'CÉDULA ', lider: 'Lider', puesto_votacion: 'Puesto de Votación', municipio_verificacion: 'municipio' })
  })
  it('sin Lider, NOMBRE o CÉDULA no es el formato', () => {
    expect(detectarFormatoCampana(['NOMBRE', 'CÉDULA', 'BARRIO'])).toBeNull()
    expect(detectarFormatoCampana(['Nombre completo', 'Documento', 'Líder'])).toBeNull()
  })
  it('número de fila del Excel y filas vacías fuera', () => {
    expect(FILAS).toHaveLength(HOJA.length - 1)
    expect(FILAS[0]).toMatchObject({ fila: 9, referente: 'Ana Lider Prueba' })
  })
  it('nombres parecidos: misma primera palabra y la segunda con una letra de diferencia', () => {
    expect(parecidos(normalizar('Pedro Molinas'), normalizar('Pedro Molina'))).toBe(true)
    expect(parecidos('ana lider prueba', 'ana lider prueba')).toBe(false)
    expect(parecidos('ana lopez', 'ana perez')).toBe(false)
    expect(parecidos('adoremos', 'adorem')).toBe(false) // una sola palabra
  })
})

describe('líderes: nunca duplicar', () => {
  const plan = analizar()

  it('líder con su propia fila: es líder nuevo con sus datos, no persona', () => {
    const ana = plan.lideresNuevos.find((l) => l.clave === 'ana lider prueba')!
    expect(ana.registro).toMatchObject({ nombre: 'Ana Lider Prueba', cedula: '9100000010', barrio: 'Panamá', mesa: 3, municipio_verificacion: 'Valledupar', coordinador: 'Coord Uno' })
    expect(plan.personasNuevas.map((p) => p.registro.nombre)).not.toContain('ANA LÍDER PRUEBA')
  })

  it('el mismo líder en minúsculas es uno solo, con sus 4 personas (+1 con aviso de cédula)', () => {
    expect(plan.lideresNuevos.filter((l) => l.clave === 'ana lider prueba')).toHaveLength(1)
    const deAna = plan.personasNuevas.filter((p) => 'clave' in (p.lider ?? {}) && (p.lider as { clave: string }).clave === 'ana lider prueba')
    expect(nombres(deAna.map((p) => ({ nombre: String(p.registro.nombre) })))).toEqual([
      'Persona Uno', 'Persona Dos', 'Persona Tres', 'Persona Cuatro', 'Persona Repetida A', 'Persona Cedula Corta',
    ])
  })

  it('líder sin fila propia: nuevo solo con el nombre', () => {
    const beto = plan.lideresNuevos.find((l) => l.clave === 'beto sin fila')!
    expect(beto.fila).toBeNull()
    expect(beto.registro).toMatchObject({ nombre: 'Beto Sin Fila', cedula: null, barrio: null })
    expect(beto.personas).toBe(1)
  })

  it('líder existente sin cédula: a completar, solo campos vacíos (no sobrescribe)', () => {
    expect(plan.lideresCompletar).toEqual([
      expect.objectContaining({ id: 'r1', campos: { cedula: '9100000030', barrio: 'Panamá', mesa: 7 } }),
    ])
    expect(plan.lideresCompletar[0]!.campos).not.toHaveProperty('coordinador') // ya tenía
    expect(plan.lideresNuevos.map((l) => l.clave)).not.toContain('lider existente sin cedula')
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Seis')!.lider).toEqual({ id: 'r1' })
  })

  it('líder existente con otra cédula: problema, no se toca; su persona va al existente', () => {
    expect(porNombre(plan.problemas, 'Lider Otra Cedula')).toMatch(/no coincide/)
    expect(plan.lideresCompletar.map((l) => l.id)).not.toContain('r2')
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Siete')!.lider).toEqual({ id: 'r2' })
  })

  it('nombre parecido: duda; no se crea ni se importan sus personas hasta resolver', () => {
    expect(plan.dudas).toEqual([{ clave: 'pedro molinas', nombre: 'Pedro Molinas', candidato: { id: 'r3', nombre: 'Pedro Molina' }, filas: 2 }])
    expect(plan.lideresNuevos.map((l) => l.clave)).not.toContain('pedro molinas')
    expect(nombres(plan.personasNuevas.map((p) => ({ nombre: String(p.registro.nombre) })))).not.toContain('Persona Ocho')

    const mismo = analizar({ resoluciones: { 'pedro molinas': 'mismo' } })
    expect(mismo.dudas).toEqual([])
    expect(mismo.personasNuevas.find((p) => p.registro.nombre === 'Persona Ocho')).toMatchObject({ lider: { id: 'r3' }, liderNombre: 'Pedro Molina' })

    const otro = analizar({ resoluciones: { 'pedro molinas': 'otro' } })
    expect(otro.lideresNuevos.find((l) => l.clave === 'pedro molinas')).toMatchObject({ personas: 2 })
  })
})

describe('personas', () => {
  const plan = analizar()

  it('persona que es líder bajo otro líder (por nombre o por cédula): aviso, no se crea', () => {
    expect(porNombre(plan.avisos, 'Beto Sin Fila')).toMatch(/Es líder; aparece bajo Ana Lider Prueba/)
    expect(porNombre(plan.avisos, 'Otra Persona')).toMatch(/Es líder; aparece bajo Beto Sin Fila/)
    const creadas = plan.personasNuevas.map((p) => p.registro.nombre)
    expect(creadas).not.toContain('Beto Sin Fila')
    expect(creadas).not.toContain('Otra Persona')
  })

  it('cédula con puntos se limpia y pasa; "-" y "No se encuentra en el censo"', () => {
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Uno')!.registro).toMatchObject({
      cedula: '1065821234', puesto_votacion: 'IE Leonidas Acuña', mesa: 12,
    })
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Uno')!.coordinador).toBe('Coord Dos')
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Dos')!.registro).toMatchObject({
      municipio_verificacion: 'No está en el censo', mesa: null, puesto_votacion: null,
    })
  })

  it('cédula de 11 dígitos: problema', () => {
    expect(porNombre(plan.problemas, 'Persona Once Digitos')).toMatch(/entre 6 y 10/)
  })

  it('cédula repetida en el archivo: problema en la segunda fila', () => {
    expect(porNombre(plan.problemas, 'Persona Repetida B')).toMatch(/Cédula repetida en el archivo \(fila 24\)/)
    expect(porNombre(plan.problemas, 'Persona Repetida A')).toBeUndefined()
  })

  it('ya existe con otro líder: aviso y se omite', () => {
    expect(porNombre(plan.avisos, 'Persona Existente')).toMatch(/Ya está con Lider Con Persona/)
  })

  it('cédula sospechosa: se importa con aviso', () => {
    expect(porNombre(plan.avisos, 'Persona Cedula Corta')).toMatch(/faltarle un dígito/)
    expect(plan.personasNuevas.map((p) => p.registro.nombre)).toContain('Persona Cedula Corta')
  })

  it('persona sin líder: se importa con "Sin líder asignado" (se crea si no existe)', () => {
    expect(plan.sinLider).toBe(1)
    const sl = plan.lideresNuevos.find((l) => l.clave === 'sin lider asignado')!
    expect(sl).toMatchObject({ fila: null, personas: 1, registro: { nombre: 'Sin líder asignado' } })
    expect(plan.personasNuevas.find((p) => p.registro.nombre === 'Persona Sin Lider')).toMatchObject({
      lider: { clave: 'sin lider asignado' },
      liderNombre: 'Sin líder asignado',
    })
  })

  it('si "Sin líder asignado" ya existe, se usa ese (no se duplica)', () => {
    const conSL: ExistentesCampana = {
      ...EXISTENTES,
      referentes: [...EXISTENTES.referentes, { ...EXISTENTES.referentes[2]!, id: 'sl', nombre: 'Sin líder asignado' }],
    }
    const p = analizarCampana(FILAS, conSL, CAT)
    expect(p.lideresNuevos.map((l) => l.clave)).not.toContain('sin lider asignado')
    expect(p.personasNuevas.find((x) => x.registro.nombre === 'Persona Sin Lider')!.lider).toEqual({ id: 'sl' })
  })

  it('sin cédula: ya existe si hay una con el mismo nombre y el mismo líder', () => {
    const conPrevia: ExistentesCampana = {
      ...EXISTENTES,
      personas: [...EXISTENTES.personas, { id: 'p2', nombre: 'persona seis bis', cedula: null, referentes: [{ id: 'r1', nombre: 'x' }] }],
    }
    const filas = filasCampana([fila('Lider Existente Sin Cedula', 'Persona Seis Bis')], columnas, 9)
    expect(analizarCampana(filas, conPrevia, CAT).existentes[0]!.detalle).toMatch(/Ya existe/)
  })

  it('misma cédula que su propio líder (nombre escrito distinto): es el líder, no una persona', () => {
    // "Lider Con Persona" ya existe con cédula 9200000004; su fila trae el nombre completo.
    const filas = filasCampana([fila('Lider Con Persona', 'Lider Con Persona Y Apellido', 9200000004)], columnas, 9)
    const p = analizarCampana(filas, EXISTENTES, CAT)
    expect(p.personasNuevas).toEqual([])
    expect(p.existentes[0]!.detalle).toMatch(/Es el mismo líder/)
  })

  it('la fila del líder repetida no es un problema', () => {
    const filas = filasCampana([fila('Beto Sin Fila', 'Beto Sin Fila'), fila('Beto Sin Fila', 'BETO SIN FILA')], columnas, 9)
    const p = analizarCampana(filas, EXISTENTES, CAT)
    expect(p.problemas).toEqual([])
    expect(p.existentes[0]!.detalle).toMatch(/repetida/)
  })
})

describe('filtros y resumen', () => {
  it('solo líderes nuevos: sin personas ni completar', () => {
    const p = analizar({ filtro: { alcance: 'solo_lideres_nuevos' } })
    expect(p.personasNuevas).toEqual([])
    expect(p.lideresCompletar).toEqual([])
    expect(p.lideresNuevos.length).toBeGreaterThan(0)
  })
  it('solo de un líder (sin importar tildes ni mayúsculas)', () => {
    const p = analizar({ filtro: { alcance: 'todo', lideres: ['BETO SIN FILA'] } })
    expect(p.lideresNuevos.map((l) => l.clave)).toEqual(['beto sin fila'])
    expect(p.personasNuevas.map((x) => x.registro.nombre)).toEqual(['Persona Cinco'])
  })
  it('solo personas: no crea líderes; las de líderes nuevos quedan con aviso', () => {
    const p = analizar({ filtro: { alcance: 'solo_personas' } })
    // Solo el líder especial para la persona sin líder; ningún líder del archivo.
    expect(p.lideresNuevos.map((l) => l.clave)).toEqual(['sin lider asignado'])
    expect(porNombre(p.avisos, 'Persona Cinco')).toMatch(/no está registrado/)
    expect(p.personasNuevas.find((x) => x.registro.nombre === 'Persona Seis')!.lider).toEqual({ id: 'r1' })
  })
  it('al modelo: solo conteos y máximo 10 ejemplos', () => {
    const r = resumenPlan(analizar())
    expect(r.ejemplos.length).toBeLessThanOrEqual(10)
    // Ana, Beto y "Sin líder asignado"
    expect(r).toMatchObject({ lideres_nuevos: 3, lideres_a_completar: 1, posibles_mismos_lideres: 1 })
  })
})
