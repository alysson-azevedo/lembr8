"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

/**
 * Autentica contra o Supabase Auth e grava a sessão nos cookies. Em caso de
 * erro de credenciais retorna o estado para o formulário (sem redirecionar),
 * permitindo feedback ao usuário.
 */
export async function login(_prev: LoginState, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/");
}

/** Encerra a sessão e volta à tela de login. */
export async function logout() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}