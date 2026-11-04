import { describe, expect, it } from 'vitest'
import { enteroOpcional, erroresCedula, textoOpcional, validarCedula } from '@/lib/validacion'

const fd = (datos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(datos)) f.set(k, v)
  return f
}

describe('textoOpcional', () => {
  it('quita espacios a los lados', () => {
    expect(textoOpcional('  Fundadores  ')).toBe('Fundadores')
  })
  it('vacío, solo espacios o ausente → null', () => {
    expect(textoOpcional('')).toBeNull()
    expect(textoOpcional('   ')).toBeNull()
    expect(textoOpcional(null)).toBeNull()
  })
})

describe('validarCedula', () => {
  it('sin cédula es válido (puede faltar)', () => {
    expect(validarCedula(null)).toBeNull()
  })
  it('acepta solo dígitos entre 5 y 12', () => {
    expect(validarCedula('12345')).toBeNull()
    expect(validarCedula('1065100001')).toBeNull()
    expect(validarCedula('123456789012')).toBeNull()
  })
  it('rechaza letras', () => {
    expect(validarCedula('12A45')).toMatch(/solo puede tener números/)
  })
  it('rechaza puntos, apóstrofos y espacios (formato del Excel: 77\'023.344)', () => {
    expect(validarCedula("77'023.344")).toMatch(/solo puede tener números/)
    expect(validarCedula('77.023.344')).toMatch(/solo puede tener números/)
    expect(validarCedula('77 023 344')).toMatch(/solo puede tener números/)
  })
  it('rechaza negativos y decimales', () => {
    expect(validarCedula('-12345')).not.toBeNull()
    expect(validarCedula('12345.6')).not.toBeNull()
  })
  it('rechaza menos de 5 o más de 12 dígitos', () => {
    expect(validarCedula('1234')).toMatch(/entre 5 y 12/)
    expect(validarCedula('1234567890123')).toMatch(/entre 5 y 12/)
  })
})

describe('enteroOpcional', () => {
  it('vacío → null sin error', () => {
    expect(enteroOpcional('', 1)).toEqual({ valor: null, error: null })
    expect(enteroOpcional(null, 0)).toEqual({ valor: null, error: null })
  })
  it('convierte números válidos', () => {
    expect(enteroOpcional(' 12 ', 1)).toEqual({ valor: 12, error: null })
    expect(enteroOpcional('0', 0)).toEqual({ valor: 0, error: null })
  })
  it('respeta el mínimo (mesa ≥ 1, meta ≥ 0)', () => {
    expect(enteroOpcional('0', 1).error).toBe('Debe ser 1 o más.')
  })
  it('rechaza texto, negativos y decimales', () => {
    expect(enteroOpcional('doce', 1).error).toBe('Escribe solo números.')
    expect(enteroOpcional('-3', 0).error).toBe('Escribe solo números.')
    expect(enteroOpcional('2.5', 1).error).toBe('Escribe solo números.')
  })
})

describe('erroresCedula (antes de enviar el formulario)', () => {
  it('sin cédula o válida → sin errores', () => {
    expect(erroresCedula(fd({}))).toEqual({})
    expect(erroresCedula(fd({ cedula: '  ' }))).toEqual({})
    expect(erroresCedula(fd({ cedula: '1003991794' }))).toEqual({})
  })
  it('cédula no válida → error en el campo cedula', () => {
    expect(erroresCedula(fd({ cedula: '12A45' }))).toHaveProperty('cedula')
  })
})
