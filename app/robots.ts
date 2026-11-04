import type { MetadataRoute } from "next";

// Sistema privado: se bloquea a todos los buscadores.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
