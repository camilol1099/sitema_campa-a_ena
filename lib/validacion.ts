// Validaciones compartidas entre el formulario (navegador) y las acciones (servidor).
// La base de datos vuelve a validar: cédula solo números (check) y única (unique).

export const SOLO_NUMEROS = /^[0-9]+$/;

export function textoOpcional(valor: FormDataEntryValue | null) {
  const t = String(valor ?? "").trim();
  return t === "" ? null : t;
}

export type CedulaLimpia = { cedula: string | null; error: string | null; aviso: string | null };

/**
 * Única regla de cédula del sistema (formularios, importación y asistente).
 * - Se quitan puntos, espacios, comas y apóstrofos ("1.065.821.234" → "1065821234").
 * - Luego solo dígitos, entre 6 y 10. Si no: error (no se guarda).
 * - Avisos (se guarda, pero se marca): 9 dígitos que empiezan por "10"
 *   (posible dígito faltante) y 10 dígitos que empiezan por "19".
 */
export function limpiarCedula(texto: string | null | undefined): CedulaLimpia {
  const t = String(texto ?? "").trim();
  if (!t) return { cedula: null, error: null, aviso: null };
  const c = t.replace(/[.\s,'’]/g, "");
  if (!SOLO_NUMEROS.test(c)) {
    return { cedula: null, error: "La cédula solo puede tener números.", aviso: null };
  }
  if (c.length < 6 || c.length > 10) {
    return { cedula: null, error: "La cédula debe tener entre 6 y 10 dígitos.", aviso: null };
  }
  const aviso =
    c.length === 9 && c.startsWith("10")
      ? "Cédula de 9 dígitos que empieza por 10: puede faltarle un dígito."
      : c.length === 10 && c.startsWith("19")
        ? "Cédula de 10 dígitos que empieza por 19: revísela."
        : null;
  return { cedula: c, error: null, aviso };
}

/** Solo el error de limpiarCedula (null si está bien o vacía). */
export function validarCedula(cedula: string | null): string | null {
  return limpiarCedula(cedula).error;
}

export function enteroOpcional(
  valor: FormDataEntryValue | null,
  minimo: number,
): { valor: number | null; error: string | null } {
  const t = String(valor ?? "").trim();
  if (t === "") return { valor: null, error: null };
  if (!SOLO_NUMEROS.test(t)) return { valor: null, error: "Escribe solo números." };
  const n = Number(t);
  if (n < minimo) return { valor: null, error: `Debe ser ${minimo} o más.` };
  return { valor: n, error: null };
}

// Validación de la cédula antes de enviar el formulario (en el navegador).
export function erroresCedula(formData: FormData): Record<string, string> {
  const err = validarCedula(textoOpcional(formData.get("cedula")));
  return err ? { cedula: err } : {};
}
