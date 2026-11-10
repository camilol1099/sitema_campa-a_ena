import { describe, expect, it } from 'vitest'
import { aCsv } from '@/lib/csv'

const lineas = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n')

describe('aCsv', () => {
  it('BOM, encabezados, separador ; y fin de línea CRLF', () => {
    const csv = aCsv(['nombre', 'cedula'], [{ nombre: 'Ana Pérez', cedula: '1065821234' }])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lineas(csv)).toEqual(['nombre;cedula', 'Ana Pérez;1065821234'])
  })

  it('null y undefined quedan vacíos; números, booleanos y objetos se escriben', () => {
    const csv = aCsv(['a', 'b', 'c', 'd', 'e'], [{ a: null, c: 7, d: true, e: { x: 1 } }])
    expect(lineas(csv)[1]).toBe(';;7;true;"{""x"":1}"')
  })

  it('pone comillas cuando hay ;, comillas o saltos de línea', () => {
    const csv = aCsv(['obs'], [{ obs: 'Calle 5; casa "azul"' }, { obs: 'línea 1\nlínea 2' }])
    expect(lineas(csv).slice(1).join('\r\n')).toBe('"Calle 5; casa ""azul"""\r\n"línea 1\nlínea 2"')
  })

  it('neutraliza fórmulas, pero deja tal cual teléfonos y números', () => {
    const csv = aCsv(['v'], [
      { v: '=HYPERLINK("x")' }, { v: '@SUMA(A1)' }, { v: '+cmd' }, { v: '-2+3*A1' },
      { v: '+57 300 123 4567' }, { v: '-5' }, { v: '-' },
    ])
    expect(lineas(csv).slice(1)).toEqual([
      `"'=HYPERLINK(""x"")"`, "'@SUMA(A1)", "'+cmd", "'-2+3*A1",
      '+57 300 123 4567', '-5', '-',
    ])
  })

  it('sin filas: solo encabezados', () => {
    expect(lineas(aCsv(['id'], []))).toEqual(['id'])
  })
})
