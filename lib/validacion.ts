// Validaciones compartidas entre el formulario (navegador) y las acciones (servidor).
// La base de datos vuelve a validar: cédula solo números (check) y única (unique).

export const SOLO_NUMEROS = /^[0-9]+$/;

export function textoOpcional(valor: FormDataEntryValue | null) {
  const t = String(valor ?? "").trim();
  return t === "" ? null : t;
}

export function validarCedula(cedula: string | null): string | null {
  if (cedula === null) return null;
  if (!SOLO_NUMEROS.test(cedula)) {
    return "La cédula solo puede tener números, sin puntos ni espacios.";
  }
  if (cedula.length < 5 || cedula.length > 12) {
    return "La cédula debe tener entre 5 y 12 dígitos.";
  }
  return null;
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
