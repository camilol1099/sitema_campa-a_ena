const numero = new Intl.NumberFormat("es-CO");
export const fmt = (n: number) => numero.format(n);

export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// Tono pálido propio de cada referente, estable a partir de su id.
export function tono(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const fechaCorta = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});
const fechaHora = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

export const fecha = (iso: string) =>
  fechaCorta.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
export const fechaConHora = (iso: string) => fechaHora.format(new Date(iso));
