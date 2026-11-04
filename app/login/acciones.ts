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
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });

  if (error) {
    if (error.code === "invalid_credentials") {
      return { error: "El correo o la contraseña no son correctos." };
    }
    if (error.code === "email_not_confirmed") {
      return { error: "Este correo todavía no ha sido confirmado." };
    }
    return { error: "No se pudo iniciar sesión. Intenta de nuevo." };
  }

  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
