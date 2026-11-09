import { describe, expect, it } from 'vitest'
import { enteroOpcional, erroresCedula, limpiarCedula, textoOpcional, validarCedula } from '@/lib/validacion'

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

describe('limpiarCedula / validarCedula (única regla del sistema)', () => {
  it('sin cédula es válido (puede faltar)', () => {
    expect(validarCedula(null)).toBeNull()
    expect(limpiarCedula('  ')).toEqual({ cedula: null, error: null, aviso: null })
  })
  it('quita puntos, espacios, comas y apóstrofos', () => {
    expect(limpiarCedula('1.065.821.234').cedula).toBe('1065821234')
    expect(limpiarCedula("77'023.344").cedula).toBe('77023344')
    expect(limpiarCedula(' 77 023 344 ').cedula).toBe('77023344')
    expect(limpiarCedula('49,730,831').cedula).toBe('49730831')
  })
  it('solo dígitos', () => {
    expect(validarCedula('12A456')).toMatch(/solo puede tener números/)
    expect(validarCedula('-123456')).not.toBeNull()
  })
  it('entre 6 y 10 dígitos', () => {
    expect(validarCedula('123456')).toBeNull()
    expect(validarCedula('1065100001')).toBeNull()
    expect(validarCedula('12345')).toMatch(/entre 6 y 10/)
    expect(validarCedula('10457122324')).toMatch(/entre 6 y 10/)
  })
  it('avisos: 9 dígitos que empiezan por 10 y 10 dígitos que empiezan por 19', () => {
    expect(limpiarCedula('106582123').aviso).toMatch(/faltarle un dígito/)
    expect(limpiarCedula('1965821234').aviso).toMatch(/19/)
    expect(limpiarCedula('1065821234').aviso).toBeNull()
    expect(limpiarCedula('49730831').aviso).toBeNull()
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
