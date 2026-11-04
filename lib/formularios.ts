import { CAMPOS_TIPO, VERIFICACIONES, esUuid, type TipoReferente } from "./ejes";
import { enteroOpcional, textoOpcional, validarCedula } from "./validacion";

// Lectura y validación de los formularios. No tocan la base: las acciones del
// servidor las usan y luego guardan. La base vuelve a validar (check y unique).

type Errores = Record<string, string>;

export type FilaReferente = Record<string, string | number | null>;

// Formulario de referente: campos comunes + solo los campos propios de su tipo.
export function leerReferente(
  formData: FormData,
  tipo: TipoReferente,
): { errores: Errores; fila: FilaReferente; cedula: string | null } {
  const errores: Errores = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  const cedula = textoOpcional(formData.get("cedula"));
  const errCedula = validarCedula(cedula);
  if (errCedula) errores.cedula = errCedula;
  const meta = enteroOpcional(formData.get("meta_personas"), 0);
  if (meta.error) errores.meta_personas = meta.error;
  const estado = formData.get("estado") === "inactivo" ? "inactivo" : "activo";

  const fila: FilaReferente = {
    tipo,
    nombre,
    cedula,
    celular: textoOpcional(formData.get("celular")),
    direccion: textoOpcional(formData.get("direccion")),
    barrio: textoOpcional(formData.get("barrio")),
    municipio: textoOpcional(formData.get("municipio")),
    estado,
    meta_personas: meta.valor,
    notas: textoOpcional(formData.get("notas")),
  };
  for (const { campo } of CAMPOS_TIPO[tipo]) {
    fila[campo] = textoOpcional(formData.get(campo));
  }

  return { errores, fila, cedula };
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
  ahora: () => Date = () => new Date(),
): {
  errores: Errores;
  fila: FilaPersona;
  referenteId: string | null;
  coordinador: string | null;
} {
  const errores: Errores = {};
  const nombre = textoOpcional(formData.get("nombre"));
  if (!nombre) errores.nombre = "Escribe el nombre.";
  const cedula = textoOpcional(formData.get("cedula"));
  const errCedula = validarCedula(cedula);
  if (errCedula) errores.cedula = errCedula;
  const mesa = enteroOpcional(formData.get("mesa"), 1);
  if (mesa.error) errores.mesa = mesa.error;

  const verificacion = textoOpcional(formData.get("municipio_verificacion"));
  if (verificacion && !(VERIFICACIONES as readonly string[]).includes(verificacion)) {
    errores.municipio_verificacion = "Elige una opción de la lista.";
  }

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
    barrio: textoOpcional(formData.get("barrio")),
    municipio_verificacion: verificacion,
    puesto_votacion: textoOpcional(formData.get("puesto_votacion")),
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
  };
}
