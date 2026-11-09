import { describe, expect, it } from 'vitest'
import { contarPorReferente, ordenarReferentes, pagina } from '@/lib/asistente/conteos'

const R = (id: string, nombre: string) => ({ id, nombre, tipo: 'lider' as const })

describe('conteos del asistente', () => {
  it('ordena por más, menos o nombre (sin tildes); empate por nombre', () => {
    const l = [
      { nombre: 'Óscar', personas: 3 },
      { nombre: 'ana', personas: 5 },
      { nombre: 'Beto', personas: 3 },
    ]
    expect(ordenarReferentes(l, 'mas').map((x) => x.nombre)).toEqual(['ana', 'Beto', 'Óscar'])
    expect(ordenarReferentes(l, 'menos').map((x) => x.nombre)).toEqual(['Beto', 'Óscar', 'ana'])
    expect(ordenarReferentes(l, 'nombre').map((x) => x.nombre)).toEqual(['ana', 'Beto', 'Óscar'])
    expect(l[0]!.nombre).toBe('Óscar') // no modifica la original
  })

  it('pagina de 50 en 50 e indica la siguiente', () => {
    const l = Array.from({ length: 124 }, (_, i) => i)
    expect(pagina(l, 0, 50)).toMatchObject({ total: 124, desde: 0, siguiente: 50 })
    expect(pagina(l, 100, 50)).toMatchObject({ desde: 100, siguiente: null })
    expect(pagina(l, 100, 50).filas).toHaveLength(24)
    expect(pagina(l, -5, 50).desde).toBe(0)
    expect(pagina(l, 999, 50)).toMatchObject({ filas: [], siguiente: null })
  })

  it('cuenta personas por referente sin repetir y el total de personas distintas', () => {
    const r = contarPorReferente([
      { persona_id: 'p1', referente: R('a', 'Ana') },
      { persona_id: 'p2', referente: R('a', 'Ana') },
      { persona_id: 'p2', referente: R('a', 'Ana') }, // repetido
      { persona_id: 'p2', referente: R('b', 'Beto') }, // misma persona con otro líder
      { persona_id: 'p3', referente: R('b', 'Beto') },
      { persona_id: 'p4', referente: R('b', 'Beto') },
    ])
    expect(r.personas).toBe(4)
    expect(r.referentes).toEqual([
      { id: 'b', nombre: 'Beto', tipo: 'lider', personas: 3 },
      { id: 'a', nombre: 'Ana', tipo: 'lider', personas: 2 },
    ])
  })
})
