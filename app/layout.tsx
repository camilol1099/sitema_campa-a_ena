import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Campaña Jesús Perpiñán",
  description: "Sistema de campaña – Concejo de Valledupar",
  // Sistema privado: que ningún buscador lo indexe.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${poppins.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {/* Manchas de la marca, fijas: es lo que el vidrio deja ver */}
        <div className="fondo" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
