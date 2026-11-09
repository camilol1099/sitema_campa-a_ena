import { leerCatalogo, type Catalogo, type Catalogos } from "./catalogos";
import { CAMPOS_TIPO, VERIFICACIONES, esUuid, type TipoReferente } from "./ejes";
import { enteroOpcional, limpiarCedula, textoOpcional } from "./validacion";

// Lectura y validación de los formularios. No tocan la base: las acciones del
// servidor las usan y luego guardan. La base vuelve a validar (check y unique).

type Errores = Record<string, string>;

export type FilaReferente = Record<string, string | number | null>;

// Nombres que hay que agregar a un catálogo antes de guardar.
export type Nuevo = { cat: Catalogo; nombre: string };

// Lee los campos de catálogo y junta errores y nombres nuevos.
function leerCatalogos(formData: FormData, cats: Catalogo[], catalogos: Catalogos, errores: Errores) {
  const valores = {} as Record<Catalogo, string | null>;
  const nuevos: Nuevo[] = [];
  for (const cat of cats) {
    const r = leerCatalogo(formData, cat, catalogos[cat]);
    if (r.error) errores[cat] = r.error;
    if (r.nuevo) nuevos.push({ cat, nombre: r.nuevo });
    valores[cat] = r.valor;
  }
  return { valores, nuevos };
}

const MAX_TEXTO = 120;

// Verificación del municipio: una opción de la lista o vacío (sin verificar).
function leerVerificacion(formData: FormData, errores: Errores) {
  const v = textoOpcional(formData.get("municipio_verificacion"));
  if (v && !(VERIFICACIONES as readonly string[]).includes(v)) {
    errores.municipio_verificacion = "Elige una opción de la lista.";
  }
  return v;
}

// Formulario de referente: campos comunes + solo los campos propios de su tipo.
export function leerReferente(
  formData: FormData,
  tipo: TipoReferente,
  catalogos: Catalogos,
): { errores: Errores; fila: FilaReferente; cedula: string | null; nuevos: Nuevo[] } {
  const errores: Errores = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  // Se guarda limpia ("1.065.821.234" → "1065821234"); misma regla en todo el sistema.
  const ced = limpiarCedula(textoOpcional(formData.get("cedula")));
  if (ced.error) errores.cedula = ced.error;
  const cedula = ced.cedula;
  const mesa = enteroOpcional(formData.get("mesa"), 1);
  if (mesa.error) errores.mesa = mesa.error;
  const verificacion = leerVerificacion(formData, errores);
  const coordinador = textoOpcional(formData.get("coordinador"));
  if (coordinador && coordinador.length > MAX_TEXTO) errores.coordinador = `Coordinador: máximo ${MAX_TEXTO} letras.`;
  const { valores, nuevos } = leerCatalogos(formData, ["barrio", "municipio", "puesto_votacion"], catalogos, errores);

  const fila: FilaReferente = {
    tipo,
    nombre,
    cedula,
    celular: textoOpcional(formData.get("celular")),
    direccion: textoOpcional(formData.get("direccion")),
    barrio: valores.barrio,
    municipio: valores.municipio,
    puesto_votacion: valores.puesto_votacion,
    mesa: mesa.valor,
    municipio_verificacion: verificacion,
    coordinador,
  };
  for (const { campo, etiqueta } of CAMPOS_TIPO[tipo]) {
    const t = textoOpcional(formData.get(campo));
    if (t && t.length > MAX_TEXTO) errores[campo] = `${etiqueta}: máximo ${MAX_TEXTO} letras.`;
    fila[campo] = t;
  }

  return { errores, fila, cedula, nuevos };
}

export type FilaPersona = {
  nombre: string | null;
  cedula: string | null;
  celular: string | null;
  direccion: string | null;
  barrio: string | null;
  municipio_verificacion: string | null;
  puesto_votacion: string | null;
  mesa: number | null;
  observaciones: string | null;
  autorizacion_datos: boolean;
  fecha_autorizacion: string | null;
};

// Formulario de persona. Al crear (esEdicion = false) se puede elegir un
// referente para vincularla de una vez. `ahora` se puede fijar en las pruebas.
export function leerPersona(
  formData: FormData,
  esEdicion: boolean,
  catalogos: Catalogos,
  ahora: () => Date = () => new Date(),
): {
  errores: Errores;
  fila: FilaPersona;
  referenteId: string | null;
  coordinador: string | null;
  nuevos: Nuevo[];
} {
  const errores: Errores = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  // Se guarda limpia ("1.065.821.234" → "1065821234"); misma regla en todo el sistema.
  const ced = limpiarCedula(textoOpcional(formData.get("cedula")));
  if (ced.error) errores.cedula = ced.error;
  const cedula = ced.cedula;
  const mesa = enteroOpcional(formData.get("mesa"), 1);
  if (mesa.error) errores.mesa = mesa.error;

  const verificacion = leerVerificacion(formData, errores);

  const { valores, nuevos } = leerCatalogos(formData, ["barrio", "puesto_votacion"], catalogos, errores);

  const autorizo = formData.get("autorizacion_datos") === "on";
  const fechaAut = textoOpcional(formData.get("fecha_autorizacion"));
  if (fechaAut && !/^\d{4}-\d{2}-\d{2}$/.test(fechaAut)) {
    errores.fecha_autorizacion = "Fecha no válida.";
  }

  const referenteId = esEdicion ? null : textoOpcional(formData.get("referente_id"));
  if (referenteId !== null && !esUuid(referenteId)) {
    errores.referente_id = "Elige un referente de la lista.";
  }

  const fila: FilaPersona = {
    nombre,
    cedula,
    celular: textoOpcional(formData.get("celular")),
    direccion: textoOpcional(formData.get("direccion")),
    barrio: valores.barrio,
    municipio_verificacion: verificacion,
    puesto_votacion: valores.puesto_votacion,
    mesa: mesa.valor,
    observaciones: textoOpcional(formData.get("observaciones")),
    autorizacion_datos: autorizo,
    // Si autorizó y no se indicó fecha, se toma la de hoy (hora de Colombia: -05:00).
    fecha_autorizacion: autorizo
      ? fechaAut
        ? `${fechaAut}T12:00:00-05:00`
        : ahora().toISOString()
      : null,
  };

  return {
    errores,
    fila,
    referenteId,
    coordinador: textoOpcional(formData.get("coordinador")),
    nuevos,
  };
}
