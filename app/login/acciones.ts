"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error: string | null };

export async function iniciarSesion(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "").trim();
  const contrasena = String(formData.get("contrasena") ?? "");

  if (!correo || !contrasena) {
    return { error: "Escriba su correo y su contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error) {
    // Mensaje genérico: nunca decir si falló el correo o la contraseña.
    if (error.code === "invalid_credentials" || error.code === "email_not_confirmed") {
      return { error: "Correo o contraseña incorrectos." };
    }
    return { error: "No se pudo iniciar sesión. Intente de nuevo." };
  }

  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
