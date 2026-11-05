import { describe, expect, it } from 'vitest'
import {
  buscarEnLista,
  claveNombre,
  filtrarLista,
  formatearNombre,
  leerCatalogo,
  limpiarNombre,
  validarNombreNuevo,
} from '@/lib/catalogos'

const fd = (datos: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(datos)) f.set(k, v)
  return f
}
const BARRIOS = ['San Martín', 'Primero de Mayo', 'Los Mayales', '450 Años', 'Villa Miriam']

describe('nombres', () => {
  it('limpiarNombre quita espacios sobrantes', () => {
    expect(limpiarNombre('  Villa   Miriam ')).toBe('Villa Miriam')
  })
  it('claveNombre iguala tildes, mayúsculas y puntos', () => {
    expect(claveNombre('SAN MARTÍN')).toBe(claveNombre('san martin'))
    expect(claveNombre('Col. Upar')).toBe(claveNombre('col upar'))
  })
  it('buscarEnLista devuelve el nombre tal como está en la lista', () => {
    expect(buscarEnLista(BARRIOS, 'san martin')).toBe('San Martín')
    expect(buscarEnLista(BARRIOS, 'San')).toBeNull()
    expect(buscarEnLista(BARRIOS, '   ')).toBeNull()
  })
})

describe('filtrarLista', () => {
  it('sin texto: todos en orden alfabético', () => {
    expect(filtrarLista(BARRIOS, '')).toEqual(['450 Años', 'Los Mayales', 'Primero de Mayo', 'San Martín', 'Villa Miriam'])
  })
  it('primero los que empiezan con lo escrito, luego los que lo contienen', () => {
    expect(filtrarLista(BARRIOS, 'may')).toEqual(['Los Mayales', 'Primero de Mayo'])
    expect(filtrarLista(['Mayales', 'Los Mayales'], 'may')).toEqual(['Mayales', 'Los Mayales'])
  })
  it('sin importar tildes', () => {
    expect(filtrarLista(BARRIOS, 'martin')).toEqual(['San Martín'])
    expect(filtrarLista(BARRIOS, 'anos')).toEqual(['450 Años'])
  })
  it('no modifica la lista original', () => {
    const copia = [...BARRIOS]
    filtrarLista(BARRIOS, '')
    expect(BARRIOS).toEqual(copia)
  })
})

describe('formatearNombre', () => {
  it('mayúscula inicial en cada palabra', () => {
    expect(formatearNombre('los milagros')).toBe('Los Milagros')
    expect(formatearNombre('  villa   CASTRO ')).toBe('Villa Castro')
    expect(formatearNombre('ñañas')).toBe('Ñañas')
  })
  it('conectores en minúscula, salvo al inicio', () => {
    expect(formatearNombre('primero de mayo')).toBe('Primero de Mayo')
    expect(formatearNombre('VILLA DE LOS ANGELES')).toBe('Villa de los Angeles')
    expect(formatearNombre('la nevada')).toBe('La Nevada')
  })
  it('respeta siglas cortas en mayúscula y salta números y signos', () => {
    expect(formatearNombre('IE leonidas acuña')).toBe('IE Leonidas Acuña')
    expect(formatearNombre('villa castro II')).toBe('Villa Castro II')
    expect(formatearNombre('7 de agosto (sur)')).toBe('7 de Agosto (Sur)')
    expect(formatearNombre('col. upar')).toBe('Col. Upar')
  })
})

describe('validarNombreNuevo', () => {
  it('acepta nombres normales con tildes, ñ, números y signos comunes', () => {
    for (const n of ['La Nevada', 'Villa Castro II', 'Urb. Los Ángeles', 'Mz 12-B', 'Col. Nacional No 4', "Barrio 7 de Agosto (sur)"]) {
      expect(validarNombreNuevo(n, 'barrio')).toBeNull()
    }
  })
  it('rechaza muy corto, muy largo, sin letras o con caracteres raros', () => {
    expect(validarNombreNuevo('A', 'barrio')).toMatch(/corto/)
    expect(validarNombreNuevo('a'.repeat(81), 'barrio')).toMatch(/largo/)
    expect(validarNombreNuevo('a'.repeat(100), 'puesto_votacion')).toBeNull()
    expect(validarNombreNuevo('123', 'barrio')).toMatch(/letras/)
    expect(validarNombreNuevo('Barrio; drop', 'barrio')).toMatch(/caracteres/)
    expect(validarNombreNuevo('Barrio <b>', 'barrio')).toMatch(/caracteres/)
  })
})

describe('leerCatalogo', () => {
  it('vacío → null, sin error', () => {
    expect(leerCatalogo(fd({ barrio: '  ' }), 'barrio', BARRIOS)).toEqual({ valor: null, nuevo: null, error: null })
    expect(leerCatalogo(fd({}), 'barrio', BARRIOS)).toEqual({ valor: null, nuevo: null, error: null })
  })
  it('de la lista → el nombre de la lista', () => {
    expect(leerCatalogo(fd({ barrio: 'los mayales' }), 'barrio', BARRIOS)).toEqual({ valor: 'Los Mayales', nuevo: null, error: null })
  })
  it('no está y no se pidió agregarlo → error', () => {
    expect(leerCatalogo(fd({ barrio: 'Las Flores' }), 'barrio', BARRIOS).error).toBe('Elige un barrio de la lista o agrégalo como nuevo.')
    expect(leerCatalogo(fd({ municipio: 'La Paz' }), 'municipio', []).error).toBe('Elige un municipio de la lista o agrégalo como nuevo.')
  })
  it('nuevo válido → se agrega', () => {
    expect(leerCatalogo(fd({ barrio: 'las  flores', barrio_nuevo: '1' }), 'barrio', BARRIOS)).toEqual({
      valor: 'Las Flores',
      nuevo: 'Las Flores',
      error: null,
    })
  })
  it('nuevo no válido → error', () => {
    expect(leerCatalogo(fd({ barrio: '##', barrio_nuevo: '1' }), 'barrio', BARRIOS).error).toBeTruthy()
  })
})
