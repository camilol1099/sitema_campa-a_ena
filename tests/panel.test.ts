import { describe, expect, it } from 'vitest'
import { CUANTOS_REFERENTES, anchoBarra, conMenos, mejores, rankingBarrios } from '@/lib/panel'
import type { PanelBarrio, PanelReferente } from '@/lib/tipos'

const ref = (nombre: string, total = 0): PanelReferente => ({
  id: nombre,
  nombre,
  tipo: 'lider',
  total_personas: total,
})

const refs = [
  ref('Rosa', 12),
  ref('Jorge', 3),
  ref('Ana', 1),
  ref('Óscar', 14),
  ref('Luis', 5),
  ref('Marta', 5),
  ref('Beto', 3),
  ref('Ingrid', 8),
  ref('Wilmer', 0),
]
const nombres = (r: { nombre: string }[]) => r.map((x) => x.nombre)

describe('mejores referentes', () => {
  it('son 5', () => {
    expect(CUANTOS_REFERENTES).toBe(5)
  })
  it('los 5 con más personas; empate por nombre', () => {
    expect(nombres(mejores(refs))).toEqual(['Óscar', 'Rosa', 'Ingrid', 'Luis', 'Marta'])
  })
  it('lista vacía → vacío', () => {
    expect(mejores([])).toEqual([])
  })
})

describe('referentes con menos personas', () => {
  it('del que menos tiene hacia arriba (incluye los que tienen 0); empate por nombre', () => {
    expect(nombres(conMenos(refs))).toEqual(['Wilmer', 'Ana', 'Beto', 'Jorge'])
  })
  it('no repite a los que ya salen entre los mejores', () => {
    const top = new Set(nombres(mejores(refs)))
    expect(nombres(conMenos(refs)).filter((n) => top.has(n))).toEqual([])
  })
  it('con 5 o menos referentes, todos salen en mejores y "con menos" queda vacío', () => {
    expect(conMenos([ref('A', 1), ref('B', 2)])).toEqual([])
  })
})

describe('barrios', () => {
  const b = (barrio: string, personas: number, sin_barrio = false): PanelBarrio => ({ barrio, personas, sin_barrio })

  it('"Sin barrio" va aparte y no entra en los rankings', () => {
    const r = rankingBarrios([b('Centro', 5), b('Sin barrio', 40, true), b('Dangond', 7)])
    expect(r.sinBarrio).toBe(40)
    expect(nombres(r.mas.map((x) => ({ nombre: x.barrio })))).toEqual(['Dangond', 'Centro'])
    expect(r.menos).toEqual([])
    expect(r.total).toBe(2)
  })

  it('con más de 10: top 10 y los que menos tienen, sin repetir', () => {
    const lista = Array.from({ length: 25 }, (_, i) => b(`B${String(i).padStart(2, '0')}`, i + 1))
    const r = rankingBarrios(lista)
    expect(r.mas).toHaveLength(10)
    expect(r.mas[0]!.personas).toBe(25)
    expect(r.menos).toHaveLength(10)
    expect(r.menos.map((x) => x.personas)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const repetidos = r.mas.filter((x) => r.menos.includes(x))
    expect(repetidos).toEqual([])
  })

  it('con 13 barrios: los 3 que sobran van en "menos"', () => {
    const lista = Array.from({ length: 13 }, (_, i) => b(`B${i}`, i + 1))
    expect(rankingBarrios(lista).menos.map((x) => x.personas)).toEqual([1, 2, 3])
  })

  it('"con menos": empates en orden alfabético', () => {
    const lista = [
      ...Array.from({ length: 10 }, (_, i) => b(`Top${i}`, 50)),
      b('Zeta', 5), b('Alfa', 5), b('Medio', 3),
    ]
    expect(rankingBarrios(lista).menos.map((x) => x.barrio)).toEqual(['Medio', 'Alfa', 'Zeta'])
  })

  it('sin personas → todo vacío', () => {
    expect(rankingBarrios([])).toEqual({ mas: [], menos: [], total: 0, sinBarrio: 0 })
  })
})

describe('formato', () => {
  it('anchoBarra: entre 0 y 100', () => {
    expect(anchoBarra(null)).toBe(0)
    expect(anchoBarra(45.5)).toBe(45.5)
    expect(anchoBarra(240)).toBe(100)
    expect(anchoBarra(-3)).toBe(0)
  })
})
